import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function createChromeMock(overrides = {}) {
  const listeners = {};
  const state = { offscreen: false, windowExists: false };
  const chrome = {
    runtime: {
      getURL: (path) => `chrome-extension://test/${path}`,
      onMessage: { addListener: (fn) => { listeners.message = fn; } },
      sendMessage: vi.fn(async (message) => {
        if (message.target === 'offscreen' && message.type === 'session.snapshot') {
          return { ok: true, snapshot: { phase: 'idle' } };
        }
        if (message.target === 'offscreen' && message.type === 'capture.start') return { ok: true };
        return { ok: true };
      }),
      getContexts: vi.fn(async ({ contextTypes }) => {
        if (contextTypes.includes('OFFSCREEN_DOCUMENT')) {
          return state.offscreen ? [{ contextType: 'OFFSCREEN_DOCUMENT', windowId: 1 }] : [];
        }
        return [];
      }),
    },
    windows: {
      get: vi.fn(async (id) => {
        if (!state.windowExists) throw new Error('No window');
        return { id };
      }),
      update: vi.fn(async () => ({})),
      create: vi.fn(async () => {
        state.windowExists = true;
        return { id: 77 };
      }),
      remove: vi.fn(async () => {
        state.windowExists = false;
      }),
      onRemoved: { addListener: (fn) => { listeners.windowRemoved = fn; } },
    },
    offscreen: {
      createDocument: vi.fn(async () => { state.offscreen = true; }),
      closeDocument: vi.fn(async () => { state.offscreen = false; }),
    },
    tabCapture: { getMediaStreamId: vi.fn(async () => 'stream-id') },
    tabs: { onRemoved: { addListener: (fn) => { listeners.tabRemoved = fn; } } },
  };

  for (const [path, value] of Object.entries(overrides)) {
    const [group, key] = path.split('.');
    if (key) chrome[group][key] = value;
    else Object.assign(chrome[group], value);
  }
  return { chrome, listeners, state };
}

async function loadBackground(mock) {
  vi.stubGlobal('chrome', mock.chrome);
  vi.resetModules();
  await import('./background.js');
  return mock;
}

function send(mock, message) {
  return new Promise((resolve) => {
    const handled = mock.listeners.message(
      { target: 'background', ...message },
      {},
      resolve,
    );
    if (!handled) resolve(undefined);
  });
}

describe('meeting startup service worker', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ available: true }),
    })));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('starts once and rejects a duplicate start without creating a second window', async () => {
    const mock = await loadBackground(createChromeMock());
    const first = await send(mock, { type: 'meeting.start', tabId: 5, tabTitle: 'Meet' });
    expect(first).toMatchObject({ ok: true, windowId: 77 });
    expect(mock.chrome.tabCapture.getMediaStreamId).toHaveBeenCalledWith({ targetTabId: 5 });
    expect(mock.chrome.windows.create).toHaveBeenCalledTimes(1);
    expect(mock.chrome.offscreen.createDocument).toHaveBeenCalledTimes(1);

    const second = await send(mock, { type: 'meeting.start', tabId: 5 });
    expect(second).toMatchObject({ ok: true, alreadyRunning: true });
    expect(mock.chrome.windows.create).toHaveBeenCalledTimes(1);
  });

  it('returns stream_id_failed with the Chrome detail and creates no window or offscreen document', async () => {
    const mock = await loadBackground(createChromeMock({
      'tabCapture.getMediaStreamId': vi.fn(async () => {
        throw new Error('INJECTED: stream id rejected');
      }),
    }));
    const response = await send(mock, { type: 'meeting.start', tabId: 5 });
    expect(response).toMatchObject({
      ok: false,
      reason: 'stream_id_failed',
      stage: 'stream_id',
    });
    expect(response.detail).toMatch(/INJECTED: stream id rejected/);
    expect(mock.chrome.windows.create).not.toHaveBeenCalled();
    expect(mock.chrome.offscreen.createDocument).not.toHaveBeenCalled();
  });

  it('returns window_create_failed and closes the offscreen document when window creation fails', async () => {
    const mock = await loadBackground(createChromeMock({
      'windows.create': vi.fn(async () => {
        throw new Error('INJECTED: window create failed');
      }),
    }));
    const response = await send(mock, { type: 'meeting.start', tabId: 5 });
    expect(response).toMatchObject({
      ok: false,
      reason: 'window_create_failed',
      stage: 'captions_window',
    });
    expect(response.detail).toMatch(/INJECTED: window create failed/);
    expect(mock.chrome.offscreen.createDocument).toHaveBeenCalledTimes(1);
    expect(mock.chrome.offscreen.closeDocument).toHaveBeenCalledTimes(1);
  });

  it('removes a created captions window when capture.start fails', async () => {
    const mock = createChromeMock();
    mock.chrome.runtime.sendMessage = vi.fn(async (message) => {
      if (message.target === 'offscreen' && message.type === 'capture.start') {
        return { ok: false, reason: 'capture_failed', detail: 'INJECTED: no audio' };
      }
      return { ok: true };
    });
    await loadBackground(mock);
    const response = await send(mock, { type: 'meeting.start', tabId: 5 });
    expect(response).toMatchObject({ ok: false, reason: 'capture_failed', stage: 'capture_start' });
    expect(response.detail).toMatch(/INJECTED: no audio/);
    expect(mock.chrome.windows.remove).toHaveBeenCalledWith(77);
    expect(mock.chrome.offscreen.closeDocument).toHaveBeenCalled();
  });

  it('returns backend_down before creating a window when the backend preflight fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      json: async () => ({}),
    })));
    const mock = await loadBackground(createChromeMock());
    const response = await send(mock, { type: 'meeting.start', tabId: 5 });
    expect(response).toMatchObject({ ok: false, reason: 'backend_down', stage: 'backend' });
    expect(mock.chrome.windows.create).not.toHaveBeenCalled();
    expect(mock.chrome.offscreen.createDocument).not.toHaveBeenCalled();
  });

  it('stops the offscreen document and allows a clean retry after a failed start', async () => {
    let failWindow = true;
    const create = vi.fn(async () => {
      if (failWindow) {
        failWindow = false;
        throw new Error('INJECTED: first window failed');
      }
      return { id: 88 };
    });
    const mock = await loadBackground(createChromeMock({ 'windows.create': create }));

    const failed = await send(mock, { type: 'meeting.start', tabId: 5 });
    expect(failed).toMatchObject({ ok: false, reason: 'window_create_failed' });
    expect(mock.chrome.offscreen.closeDocument).toHaveBeenCalled();

    const retried = await send(mock, { type: 'meeting.start', tabId: 5 });
    expect(retried).toMatchObject({ ok: true, windowId: 88 });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('reports safe diagnostics without tab titles or URLs', async () => {
    const mock = await loadBackground(createChromeMock({
      'tabCapture.getMediaStreamId': vi.fn(async () => {
        throw new Error('INJECTED: stream id rejected');
      }),
    }));
    await send(mock, { type: 'meeting.start', tabId: 5, tabTitle: 'Secret meeting', tabUrl: 'https://meet.google.com/secret' });
    const diagnostics = await send(mock, { type: 'meeting.diagnostics' });
    expect(diagnostics).toMatchObject({ ok: true, active: false });
    expect(diagnostics.lastStartup).toMatchObject({
      stage: 'stream_id',
      reason: 'stream_id_failed',
      ok: false,
    });
    const text = JSON.stringify(diagnostics);
    expect(text).not.toContain('Secret meeting');
    expect(text).not.toContain('meet.google.com/secret');
  });

  it('stops capture when the captions window or captured tab closes', async () => {
    for (const closeEvent of ['windowRemoved', 'tabRemoved']) {
      const mock = await loadBackground(createChromeMock());
      await send(mock, { type: 'meeting.start', tabId: 5 });
      mock.listeners[closeEvent](closeEvent === 'tabRemoved' ? 5 : 77);
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(mock.chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
        target: 'offscreen',
        type: 'capture.stop',
      }));
    }
  });
});
