import { applyCaptionMessage, clearCaptionState, createCaptionState } from '../lib/meeting/captionState.js';
import { DEFAULT_LANGUAGE, MAX_SESSION_MS, WORKLET_FILE } from '../lib/meeting/config.js';
import { describeCaptureError, describeTransportError } from '../lib/meeting/errors.js';
import { MSG, TARGET } from '../lib/meeting/messages.js';
import { TRANSPORT_STATUS, TranscriptionTransport } from '../lib/meeting/transport.js';
import { CAPTURE_STATE, TabAudioCapture } from './tabAudio.js';

// The offscreen document is the only context that owns tab audio, PCM frames, the WebSocket and the transcript.
// The service worker never holds audio or transcript text.

let active = null;
let lastSession = null;
let capture = null;
let transport = null;
let captions = createCaptionState();
let phase = 'idle';
let error = null;
let stopping = false;
let endedSent = false;
let sessionTimer = null;

function snapshot() {
  const source = active ?? lastSession;
  return {
    phase,
    error,
    sessionId: source?.sessionId ?? null,
    tabId: source?.tabId ?? null,
    tabTitle: source?.tabTitle ?? '',
    tabUrl: source?.tabUrl ?? '',
    startedAt: active?.startedAt ?? lastSession?.startedAt ?? null,
    language: active?.language ?? DEFAULT_LANGUAGE,
    droppedFrames: transport?.snapshot().droppedFrames ?? 0,
    captions: { interim: captions.interim, finals: captions.finals },
  };
}

function send(target, type, payload = {}) {
  return chrome.runtime.sendMessage({ target, type, ...payload }).catch(() => undefined);
}

function broadcastState() {
  send(TARGET.CAPTIONS, MSG.SESSION_STATE, { snapshot: snapshot() });
}

function broadcastCaptions() {
  send(TARGET.CAPTIONS, MSG.CAPTIONS_UPDATE, {
    captions: { interim: captions.interim, finals: captions.finals },
  });
}

function maybeListening() {
  if (phase !== 'starting') return;
  if (capture?.state !== CAPTURE_STATE.CAPTURING) return;
  if (transport?.snapshot().status !== TRANSPORT_STATUS.LISTENING) return;
  phase = 'listening';
  broadcastState();
}

function handleTransportChange(state) {
  if (stopping) return;
  if (state.status === TRANSPORT_STATUS.FAILED) {
    const code = state.error?.code ?? 'connection_failed';
    fail(code, describeTransportError(code));
    return;
  }
  if (state.status === TRANSPORT_STATUS.RECONNECTING) {
    phase = 'reconnecting';
    broadcastState();
    return;
  }
  if (state.status === TRANSPORT_STATUS.LISTENING) {
    maybeListening();
    if (phase === 'reconnecting') {
      phase = 'listening';
      broadcastState();
    }
    return;
  }
  if (state.status === TRANSPORT_STATUS.STOPPED && active && !stopping) {
    phase = 'stopped';
    broadcastState();
  }
}

function handleCaption(message) {
  const next = applyCaptionMessage(captions, message);
  if (next === captions) return;
  captions = next;
  broadcastCaptions();
}

function handleCaptureState(state) {
  if (state === CAPTURE_STATE.CAPTURING) maybeListening();
}

function handleCaptureError(code) {
  if (stopping) return;
  fail(code, describeCaptureError(code));
}

async function start(message) {
  if (active) return { ok: false, reason: 'already_running' };
  const tabId = Number.isInteger(message.tabId) ? message.tabId : null;
  if (!tabId) return { ok: false, reason: 'no_tab' };
  if (!message.streamId) return { ok: false, reason: 'no_stream' };

  active = {
    sessionId: typeof message.sessionId === 'string' ? message.sessionId : null,
    tabId,
    tabTitle: typeof message.tabTitle === 'string' ? message.tabTitle : '',
    tabUrl: typeof message.tabUrl === 'string' ? message.tabUrl : '',
    startedAt: Date.now(),
    language: DEFAULT_LANGUAGE,
  };
  lastSession = {
    sessionId: active.sessionId,
    tabId: active.tabId,
    tabTitle: active.tabTitle,
    tabUrl: active.tabUrl,
    startedAt: active.startedAt,
  };
  captions = createCaptionState();
  error = null;
  phase = 'starting';
  stopping = false;
  endedSent = false;
  clearTimeout(sessionTimer);
  sessionTimer = setTimeout(() => {
    stop('session_time_limit', {
      code: 'session_time_limit',
      message: describeTransportError('session_time_limit'),
    });
  }, MAX_SESSION_MS);
  broadcastState();

  transport = new TranscriptionTransport({
    language: DEFAULT_LANGUAGE,
    onChange: handleTransportChange,
    onCaption: handleCaption,
  });
  transport.start();

  capture = new TabAudioCapture({
    workletUrl: chrome.runtime.getURL(WORKLET_FILE),
    onFrame: (frame) => transport?.sendAudio(frame),
    onState: handleCaptureState,
    onError: handleCaptureError,
  });

  const started = await capture.start(message.streamId);
  if (!started) {
    await stop('capture_failed', { code: 'capture_failed', message: describeCaptureError('capture_failed') });
    return { ok: false, reason: 'capture_failed' };
  }

  if (transport?.snapshot().status === TRANSPORT_STATUS.FAILED) {
    const code = transport.snapshot().error?.code ?? 'connection_failed';
    await stop('connection_failed', { code, message: describeTransportError(code) });
    return { ok: false, reason: code };
  }

  maybeListening();
  return { ok: true };
}

async function stop(reason = 'user', nextError = null) {
  if (!active && phase === 'idle') return { ok: true, alreadyStopped: true };
  if (stopping) return { ok: true, stopping: true };
  stopping = true;
  clearTimeout(sessionTimer);
  sessionTimer = null;
  phase = 'stopping';
  broadcastState();

  const currentTransport = transport;
  transport = null;
  // Close the WebSocket first so no further audio can leave the computer, then stop the tab track and audio graph.
  currentTransport?.stop();

  const currentCapture = capture;
  capture = null;
  if (currentCapture) await currentCapture.stop();

  captions = applyCaptionMessage(captions, { type: 'disconnect' });
  active = null;
  error = nextError;
  phase = nextError ? 'error' : 'stopped';
  broadcastCaptions();
  broadcastState();
  stopping = false;

  if (!endedSent) {
    endedSent = true;
    send(TARGET.BACKGROUND, MSG.CAPTURE_ENDED, {
      reason,
      sessionId: lastSession?.sessionId ?? null,
      error: nextError,
      finalPhase: phase,
      droppedFrames: currentTransport?.snapshot().droppedFrames ?? 0,
    });
  }
  return { ok: true, phase };
}

function fail(code, message) {
  if (stopping) return;
  stop('error', { code, message });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.target !== TARGET.OFFSCREEN) return undefined;

  if (message.type === MSG.CAPTURE_START) {
    start(message).then(sendResponse);
    return true;
  }
  if (message.type === MSG.CAPTURE_STOP) {
    stop(message.reason ?? 'user').then(sendResponse);
    return true;
  }
  if (message.type === MSG.SESSION_SNAPSHOT) {
    sendResponse({ ok: true, snapshot: snapshot() });
    return false;
  }
  if (message.type === MSG.CAPTIONS_CLEAR) {
    captions = clearCaptionState(captions);
    broadcastCaptions();
    broadcastState();
    sendResponse({ ok: true });
    return false;
  }
  sendResponse({ ok: false, reason: 'unknown_message' });
  return false;
});
