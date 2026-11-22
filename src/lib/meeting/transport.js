import {
  DEFAULT_LANGUAGE,
  MAX_BUFFERED_BYTES,
  MAX_QUEUED_FRAMES,
  PING_INTERVAL_MS,
  PONG_TIMEOUT_MS,
  READY_TIMEOUT_MS,
  RECONNECT_DELAYS_MS,
  STOP_GRACE_MS,
  buildTranscriptionSocketUrl,
} from './config.js';
import {
  NON_RETRYABLE_CODES,
  buildControlMessage,
  buildStartMessage,
  isFatalCloseCode,
  isValidAudioFrame,
  parseServerMessage,
} from './protocol.js';

export const TRANSPORT_STATUS = Object.freeze({
  IDLE: 'idle',
  CONNECTING: 'connecting',
  LISTENING: 'listening',
  RECONNECTING: 'reconnecting',
  STOPPING: 'stopping',
  STOPPED: 'stopped',
  FAILED: 'failed',
});

const DEFAULT_TIMING = Object.freeze({
  readyTimeoutMs: READY_TIMEOUT_MS,
  pingIntervalMs: PING_INTERVAL_MS,
  pongTimeoutMs: PONG_TIMEOUT_MS,
  stopGraceMs: STOP_GRACE_MS,
  stableMs: 10000,
  reconnectDelaysMs: RECONNECT_DELAYS_MS,
  maxQueuedFrames: MAX_QUEUED_FRAMES,
  maxBufferedBytes: MAX_BUFFERED_BYTES,
});

const TIMER_KEYS = ['ready', 'ping', 'pong', 'stop', 'reconnect', 'stable'];

export class TranscriptionTransport {
  constructor({
    url = buildTranscriptionSocketUrl(),
    language = DEFAULT_LANGUAGE,
    createSocket = (target) => new WebSocket(target),
    onChange = () => {},
    onCaption = () => {},
    onEvent = () => {},
    timings = {},
  } = {}) {
    this.url = url;
    this.language = language;
    this.createSocket = createSocket;
    this.onChange = onChange;
    this.onCaption = onCaption;
    this.onEvent = onEvent;
    this.timing = { ...DEFAULT_TIMING, ...timings };
    this.status = TRANSPORT_STATUS.IDLE;
    this.error = null;
    this.droppedFrames = 0;
    this.lastFinalSeq = 0;
    this.socket = null;
    this.queue = [];
    this.attempts = 0;
    this.generation = 0;
    this.userStopped = false;
    this.disposed = false;
    this.everOpened = false;
    this.timers = Object.fromEntries(TIMER_KEYS.map((key) => [key, null]));
  }

  snapshot() {
    return {
      status: this.status,
      error: this.error,
      droppedFrames: this.droppedFrames,
      lastFinalSeq: this.lastFinalSeq,
    };
  }

  start() {
    if (this.status !== TRANSPORT_STATUS.IDLE && this.status !== TRANSPORT_STATUS.STOPPED && this.status !== TRANSPORT_STATUS.FAILED) {
      return false;
    }
    this.userStopped = false;
    this.error = null;
    this.droppedFrames = 0;
    this.attempts = 0;
    this.everOpened = false;
    this.open();
    return true;
  }

  sendAudio(frame) {
    if (!isValidAudioFrame(frame)) {
      this.onEvent({ type: 'invalid_frame' });
      return false;
    }
    if (this.status === TRANSPORT_STATUS.LISTENING) {
      if (!this.socket || this.socket.readyState !== 1) return this.drop('not_open');
      if ((this.socket.bufferedAmount ?? 0) > this.timing.maxBufferedBytes) return this.drop('backpressure');
      this.socket.send(frame);
      return true;
    }
    if (this.status === TRANSPORT_STATUS.CONNECTING || this.status === TRANSPORT_STATUS.RECONNECTING) {
      if (this.queue.length >= this.timing.maxQueuedFrames) {
        this.queue.shift();
        this.recordDrop('queue_full');
      }
      this.queue.push(frame);
      return true;
    }
    return false;
  }

  // Stop is immediate: the socket is asked to close at once. The caller stops microphone/tab tracks before this.
  stop() {
    if (this.status === TRANSPORT_STATUS.STOPPED || this.status === TRANSPORT_STATUS.IDLE) {
      this.finishStop();
      return;
    }
    this.userStopped = true;
    this.queue = [];
    this.clearAllTimers();
    const socket = this.socket;
    if (socket && socket.readyState === 1) {
      try { socket.send(JSON.stringify(buildControlMessage('stop'))); } catch {}
    }
    this.setStatus(TRANSPORT_STATUS.STOPPING);
    this.timers.stop = setTimeout(() => this.finishStop(), this.timing.stopGraceMs);
    try { socket?.close?.(); } catch {}
  }

  dispose() {
    this.disposed = true;
    this.generation += 1;
    this.queue = [];
    this.clearAllTimers();
    const socket = this.socket;
    this.socket = null;
    try { socket?.close?.(); } catch {}
    this.status = TRANSPORT_STATUS.STOPPED;
  }

  open() {
    this.generation += 1;
    const generation = this.generation;
    this.queue = [];
    this.setStatus(this.attempts > 0 ? TRANSPORT_STATUS.RECONNECTING : TRANSPORT_STATUS.CONNECTING);

    let socket;
    try {
      socket = this.createSocket(this.url);
    } catch {
      this.error = { code: 'connection_failed', message: '', recoverable: true };
      this.handleClose(1006, generation);
      return;
    }
    this.socket = socket;
    const current = () => generation === this.generation && socket === this.socket;

    socket.onopen = () => {
      if (!current()) return;
      this.everOpened = true;
      socket.send(JSON.stringify(buildStartMessage({
        language: this.language,
        seqStart: this.lastFinalSeq + 1,
      })));
    };
    socket.onmessage = (event) => {
      if (current()) this.handleMessage(event.data);
    };
    socket.onerror = () => {
      // A close event always follows; recovery is decided there.
    };
    socket.onclose = (event) => {
      if (current()) this.handleClose(event?.code, generation);
    };

    this.startTimer('ready', this.timing.readyTimeoutMs, () => {
      this.onEvent({ type: 'ready_timeout' });
      this.closeSocket();
    });
    this.emit();
  }

  handleMessage(raw) {
    const message = parseServerMessage(raw);
    if (!message) {
      this.onEvent({ type: 'protocol_error' });
      return;
    }

    switch (message.type) {
      case 'ready': {
        if (this.status !== TRANSPORT_STATUS.CONNECTING && this.status !== TRANSPORT_STATUS.RECONNECTING) return;
        this.clearTimer('ready');
        this.error = null;
        this.setStatus(TRANSPORT_STATUS.LISTENING);
        this.startPing();
        this.startTimer('stable', this.timing.stableMs, () => {
          this.attempts = 0;
          this.timers.stable = null;
        });
        this.flushQueue();
        return;
      }
      case 'interim':
      case 'final':
        if (message.type === 'final') this.lastFinalSeq = Math.max(this.lastFinalSeq, message.seq);
        this.onCaption(message);
        this.emit();
        return;
      case 'error':
        this.error = { code: message.code, message: message.message, recoverable: message.recoverable };
        this.onEvent({ type: 'backend_error', code: message.code, recoverable: message.recoverable });
        this.emit();
        return;
      case 'pong':
        this.clearTimer('pong');
        return;
      case 'state':
        // The extension does not use pause/resume in Phase 1.
        return;
      case 'closed':
        // The socket closes next.
        return;
      default:
        this.onEvent({ type: 'protocol_error' });
    }
  }

  handleClose(code, generation) {
    if (generation !== this.generation) return;
    this.socket = null;
    this.queue = [];
    this.clearAllTimers();

    if (this.userStopped || this.status === TRANSPORT_STATUS.STOPPING) {
      this.finishStop();
      return;
    }
    if (code === 1008) {
      this.fail('origin_rejected', false);
      return;
    }
    if (code === 1009) {
      this.fail('frame_too_large', false);
      return;
    }
    // A handshake rejected with HTTP 403 surfaces as 1006 before the socket opens. The backend preflight only
    // proves the HTTP server is up, so this usually means the extension origin is not allowed.
    if (code === 1006 && !this.everOpened) {
      this.fail('origin_rejected', false);
      return;
    }
    if (this.error && (this.error.recoverable === false || NON_RETRYABLE_CODES.has(this.error.code))) {
      this.fail(this.error.code, false);
      return;
    }
    if (isFatalCloseCode(code)) {
      this.fail('origin_rejected', false);
      return;
    }
    if (this.attempts >= this.timing.reconnectDelaysMs.length) {
      this.fail('reconnect_exhausted', false);
      return;
    }

    const delay = this.timing.reconnectDelaysMs[this.attempts];
    this.attempts += 1;
    this.onEvent({ type: 'reconnect_scheduled', attempt: this.attempts, delayMs: delay });
    this.setStatus(TRANSPORT_STATUS.RECONNECTING);
    this.timers.reconnect = setTimeout(() => {
      this.timers.reconnect = null;
      this.open();
    }, delay);
    this.emit();
  }

  fail(code, recoverable = false) {
    this.setStatus(TRANSPORT_STATUS.FAILED);
    this.error = { code, message: '', recoverable };
    this.clearAllTimers();
    this.closeSocket();
    this.onEvent({ type: 'failed', code });
    this.emit();
  }

  finishStop() {
    this.clearAllTimers();
    this.generation += 1;
    this.socket = null;
    this.queue = [];
    this.setStatus(TRANSPORT_STATUS.STOPPED);
  }

  closeSocket() {
    const socket = this.socket;
    if (!socket) return;
    try { socket.close(); } catch {}
  }

  flushQueue() {
    const frames = this.queue;
    this.queue = [];
    for (const frame of frames) {
      if (!this.socket || this.socket.readyState !== 1) break;
      this.socket.send(frame);
    }
  }

  startPing() {
    this.clearTimer('ping');
    this.timers.ping = setInterval(() => this.sendPing(), this.timing.pingIntervalMs);
  }

  sendPing() {
    if (this.status !== TRANSPORT_STATUS.LISTENING) return;
    if (!this.socket || this.socket.readyState !== 1) return;
    try { this.socket.send(JSON.stringify(buildControlMessage('ping'))); } catch { return; }
    if (!this.timers.pong) {
      this.startTimer('pong', this.timing.pongTimeoutMs, () => {
        this.onEvent({ type: 'pong_timeout' });
        this.closeSocket();
      });
    }
  }

  drop(reason) {
    this.recordDrop(reason);
    return false;
  }

  recordDrop(reason) {
    this.droppedFrames += 1;
    this.onEvent({ type: 'audio_dropped', reason, total: this.droppedFrames });
  }

  setStatus(status) {
    if (this.status === status) return;
    this.status = status;
    this.emit();
  }

  emit() {
    if (!this.disposed) this.onChange(this.snapshot());
  }

  startTimer(key, ms, callback) {
    this.clearTimer(key);
    this.timers[key] = setTimeout(() => {
      this.timers[key] = null;
      callback();
    }, ms);
  }

  clearTimer(key) {
    const id = this.timers[key];
    if (id === null || id === undefined) return;
    clearTimeout(id);
    clearInterval(id);
    this.timers[key] = null;
  }

  clearAllTimers() {
    for (const key of TIMER_KEYS) this.clearTimer(key);
  }
}
