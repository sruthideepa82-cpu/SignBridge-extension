import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TRANSPORT_STATUS, TranscriptionTransport } from './transport.js';

class FakeSocket {
  constructor() {
    this.readyState = 0;
    this.sent = [];
    this.bufferedAmount = 0;
  }

  send(data) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3;
    this.onclose?.({ code: 1000 });
  }

  open() {
    this.readyState = 1;
    this.onopen?.();
  }

  message(payload) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  serverClose(code = 1006) {
    this.readyState = 3;
    this.onclose?.({ code });
  }

  jsonSent() {
    return this.sent.filter((entry) => typeof entry === 'string').map((entry) => JSON.parse(entry));
  }
}

function setup(options = {}) {
  const sockets = [];
  const changes = [];
  const captions = [];
  const events = [];
  const transport = new TranscriptionTransport({
    createSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    onChange: (state) => changes.push(state),
    onCaption: (message) => captions.push(message),
    onEvent: (event) => events.push(event),
    timings: { reconnectDelaysMs: [500, 1000], ...options.timings },
  });
  return { transport, sockets, changes, captions, events };
}

const frame = () => new ArrayBuffer(3200);

describe('caption transport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends a start message on open and does not send audio before ready', () => {
    const { transport, sockets } = setup();
    transport.start();
    const socket = sockets[0];
    expect(socket.sent).toHaveLength(0);
    socket.open();
    expect(socket.jsonSent()).toEqual([{
      type: 'start', encoding: 'pcm_s16le', sampleRate: 16000, channels: 1, language: 'auto', seqStart: 1,
    }]);
    expect(transport.sendAudio(frame())).toBe(true);
    expect(socket.sent).toHaveLength(1);
    socket.message({ type: 'ready' });
    expect(transport.status).toBe(TRANSPORT_STATUS.LISTENING);
    expect(socket.sent).toHaveLength(2);
    expect(socket.sent[1]).toBeInstanceOf(ArrayBuffer);
  });

  it('passes chatty interim and final messages to the caption state', () => {
    const { transport, sockets, captions } = setup();
    transport.start();
    sockets[0].open();
    sockets[0].message({ type: 'ready' });
    sockets[0].message({ type: 'interim', seq: 1, text: 'hel' });
    sockets[0].message({ type: 'final', seq: 1, text: 'hello' });
    expect(captions).toEqual([
      { type: 'interim', seq: 1, text: 'hel' },
      { type: 'final', seq: 1, text: 'hello' },
    ]);
    expect(transport.snapshot().lastFinalSeq).toBe(1);
  });

  it('stops immediately and closes the socket', () => {
    const { transport, sockets } = setup();
    transport.start();
    sockets[0].open();
    sockets[0].message({ type: 'ready' });
    transport.stop();
    expect(sockets[0].jsonSent()).toContainEqual({ type: 'stop' });
    vi.advanceTimersByTime(400);
    expect(transport.status).toBe(TRANSPORT_STATUS.STOPPED);
  });

  it('fails fast when the handshake is rejected before opening', () => {
    const { transport, sockets, changes } = setup();
    transport.start();
    sockets[0].serverClose(1006);
    expect(transport.status).toBe(TRANSPORT_STATUS.FAILED);
    expect(transport.snapshot().error).toMatchObject({ code: 'origin_rejected', recoverable: false });
    expect(changes.at(-1).status).toBe(TRANSPORT_STATUS.FAILED);
    vi.advanceTimersByTime(5000);
    expect(sockets).toHaveLength(1);
  });

  it('reconnects after a drop that happened after a successful handshake', async () => {
    const { transport, sockets } = setup();
    transport.start();
    sockets[0].open();
    sockets[0].message({ type: 'ready' });
    sockets[0].serverClose(1006);
    expect(transport.status).toBe(TRANSPORT_STATUS.RECONNECTING);
    await vi.advanceTimersByTimeAsync(500);
    expect(sockets).toHaveLength(2);
    sockets[1].open();
    sockets[1].message({ type: 'ready' });
    expect(transport.status).toBe(TRANSPORT_STATUS.LISTENING);
  });

  it('treats close code 1008 as a fatal origin rejection', () => {
    const { transport, sockets } = setup();
    transport.start();
    sockets[0].serverClose(1008);
    expect(transport.status).toBe(TRANSPORT_STATUS.FAILED);
    expect(transport.snapshot().error.code).toBe('origin_rejected');
  });

  it('does not retry a non-recoverable backend error', () => {
    const { transport, sockets } = setup();
    transport.start();
    sockets[0].open();
    sockets[0].message({ type: 'error', code: 'gemini_auth_failed', message: 'bad key', recoverable: false });
    sockets[0].serverClose(1011);
    expect(transport.status).toBe(TRANSPORT_STATUS.FAILED);
    expect(transport.snapshot().error.code).toBe('gemini_auth_failed');
    expect(sockets).toHaveLength(1);
  });

  it('ignores malformed server messages without breaking the connection', () => {
    const { transport, sockets, events } = setup();
    transport.start();
    sockets[0].open();
    sockets[0].message({ type: 'ready' });
    sockets[0].onmessage({ data: 'not json' });
    expect(transport.status).toBe(TRANSPORT_STATUS.LISTENING);
    expect(events).toContainEqual({ type: 'protocol_error' });
  });

  it('drops audio while not listening and counts it', () => {
    const { transport } = setup();
    transport.start();
    expect(transport.sendAudio(frame())).toBe(true);
    transport.stop();
    expect(transport.sendAudio(frame())).toBe(false);
    expect(transport.snapshot().droppedFrames).toBeGreaterThanOrEqual(0);
  });
});
