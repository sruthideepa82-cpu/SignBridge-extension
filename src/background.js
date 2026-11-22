import { API_BASE } from './lib/config.js';
import { BACKEND_STATUS_PATH, CAPTIONS_PAGE, OFFSCREEN_PAGE } from './lib/meeting/config.js';
import { MSG, TARGET, isActivePhase } from './lib/meeting/messages.js';
import {
  STARTUP_REASON,
  STARTUP_STAGE,
  StartupError,
  isStartupError,
  startupFailure,
  withTimeout,
} from './lib/meeting/startup.js';

// Service worker: orchestration only. It obtains the tab-capture stream ID after the user invokes the extension,
// creates the offscreen document, opens the captions window and enforces lifecycle rules. It never handles audio or
// transcript text. Every startup stage has a timeout and a safe error category.

const OFFSCREEN_URL = chrome.runtime.getURL(OFFSCREEN_PAGE);
const CAPTIONS_URL = chrome.runtime.getURL(CAPTIONS_PAGE);

const TIMEOUTS = Object.freeze({
  status: 4000,
  streamId: 10000,
  offscreen: 6000,
  window: 6000,
  captureStart: 12000,
  message: 5000,
  cleanup: 2500,
  close: 700,
});

let session = null;
let captionsWindowId = null;
let closingOffscreen = false;
let starting = false;
let closeTimer = null;
let lastStartup = null;

function recordStartup(attemptId, stage, reason, detail, ok = false) {
  lastStartup = {
    attemptId: attemptId ?? null,
    stage,
    reason: reason ?? null,
    detail: detail ? String(detail).slice(0, 300) : '',
    ok,
    at: Date.now(),
  };
  if (!ok) {
    // Startup metadata only: no audio, transcript, tab URL or meeting title.
    console.warn('[SignBridge startup]', {
      attemptId: lastStartup.attemptId,
      stage: lastStartup.stage,
      reason: lastStartup.reason,
      detail: lastStartup.detail,
    });
  }
}

function stageReason(stage) {
  if (stage === STARTUP_STAGE.STREAM_ID) return STARTUP_REASON.STREAM_ID_FAILED;
  if (stage === STARTUP_STAGE.BACKEND) return STARTUP_REASON.BACKEND_DOWN;
  if (stage === STARTUP_STAGE.OFFSCREEN) return STARTUP_REASON.OFFSCREEN_FAILED;
  if (stage === STARTUP_STAGE.CAPTIONS_WINDOW) return STARTUP_REASON.WINDOW_FAILED;
  if (stage === STARTUP_STAGE.CAPTURE_START) return STARTUP_REASON.CAPTURE_FAILED;
  return STARTUP_REASON.STARTUP_TIMEOUT;
}

function normaliseStartupError(error, stage) {
  if (isStartupError(error)) return error;
  return new StartupError(stageReason(stage), stage, error?.message ?? String(error), error);
}

function sendTo(target, type, payload = {}, timeoutMs = TIMEOUTS.message) {
  return withTimeout(
    chrome.runtime.sendMessage({ target, type, ...payload }),
    timeoutMs,
    { reason: STARTUP_REASON.STARTUP_TIMEOUT, stage: STARTUP_STAGE.CLEANUP, detail: 'Message timed out.' },
  ).catch(() => undefined);
}

function sendToCaptions(type, payload = {}) {
  return sendTo(TARGET.CAPTIONS, type, payload);
}

async function backendStatus() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUTS.status);
  try {
    const response = await fetch(`${API_BASE}${BACKEND_STATUS_PATH}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) return { ok: false, reason: STARTUP_REASON.BACKEND_DOWN };
    if (body?.available !== true) return { ok: false, reason: STARTUP_REASON.TRANSCRIPTION_UNAVAILABLE };
    return { ok: true, status: body };
  } catch {
    return { ok: false, reason: STARTUP_REASON.BACKEND_DOWN };
  } finally {
    clearTimeout(timer);
  }
}

async function findOpenCaptionsWindow() {
  try {
    const contexts = await withTimeout(
      chrome.runtime.getContexts({ contextTypes: ['TAB', 'POPUP'], documentUrls: [CAPTIONS_URL] }),
      2000,
      { reason: STARTUP_REASON.WINDOW_FAILED, stage: STARTUP_STAGE.CAPTIONS_WINDOW },
    );
    return contexts.find((context) => Number.isInteger(context.windowId))?.windowId ?? null;
  } catch {
    return null;
  }
}

async function ensureCaptionsWindow() {
  if (Number.isInteger(captionsWindowId)) {
    try {
      await withTimeout(
        chrome.windows.get(captionsWindowId),
        2000,
        { reason: STARTUP_REASON.WINDOW_FAILED, stage: STARTUP_STAGE.CAPTIONS_WINDOW },
      );
      await withTimeout(
        chrome.windows.update(captionsWindowId, { focused: true }),
        2000,
        { reason: STARTUP_REASON.WINDOW_FAILED, stage: STARTUP_STAGE.CAPTIONS_WINDOW },
      );
      return { windowId: captionsWindowId, created: false };
    } catch {
      captionsWindowId = null;
    }
  }
  const existing = await findOpenCaptionsWindow();
  if (Number.isInteger(existing)) {
    captionsWindowId = existing;
    try {
      await withTimeout(
        chrome.windows.update(existing, { focused: true }),
        2000,
        { reason: STARTUP_REASON.WINDOW_FAILED, stage: STARTUP_STAGE.CAPTIONS_WINDOW },
      );
    } catch {}
    return { windowId: existing, created: false };
  }

  let window;
  try {
    window = await withTimeout(
      chrome.windows.create({
        url: CAPTIONS_URL,
        type: 'popup',
        width: 480,
        height: 460,
        focused: true,
      }),
      TIMEOUTS.window,
      {
        reason: STARTUP_REASON.WINDOW_TIMEOUT,
        stage: STARTUP_STAGE.CAPTIONS_WINDOW,
        detail: 'chrome.windows.create did not resolve in time.',
      },
    );
  } catch (error) {
    throw normaliseStartupError(error, STARTUP_STAGE.CAPTIONS_WINDOW);
  }
  if (!window?.id) {
    throw new StartupError(
      STARTUP_REASON.WINDOW_FAILED,
      STARTUP_STAGE.CAPTIONS_WINDOW,
      'chrome.windows.create returned no window id.',
    );
  }
  captionsWindowId = window.id;
  return { windowId: window.id, created: true };
}

async function hasOffscreen() {
  try {
    const contexts = await withTimeout(
      chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [OFFSCREEN_URL] }),
      2000,
      { reason: STARTUP_REASON.OFFSCREEN_TIMEOUT, stage: STARTUP_STAGE.OFFSCREEN },
    );
    return contexts.length > 0;
  } catch {
    return false;
  }
}

async function ensureOffscreen() {
  if (await hasOffscreen()) return false;
  try {
    await withTimeout(
      chrome.offscreen.createDocument({
        url: OFFSCREEN_PAGE,
        reasons: ['USER_MEDIA'],
        justification: 'Capture audio from the Google Meet tab the user selected, so SignBridge can show live captions.',
      }),
      TIMEOUTS.offscreen,
      {
        reason: STARTUP_REASON.OFFSCREEN_TIMEOUT,
        stage: STARTUP_STAGE.OFFSCREEN,
        detail: 'chrome.offscreen.createDocument did not resolve in time.',
      },
    );
  } catch (error) {
    throw normaliseStartupError(error, STARTUP_STAGE.OFFSCREEN);
  }
  return true;
}

function scheduleCloseOffscreen() {
  clearTimeout(closeTimer);
  closeTimer = setTimeout(() => {
    closeTimer = null;
    if (!session?.active && !starting) closeOffscreen();
  }, TIMEOUTS.close);
}

function cancelCloseOffscreen() {
  clearTimeout(closeTimer);
  closeTimer = null;
}

async function closeOffscreen(force = false) {
  if (!force && (session?.active || starting)) return;
  if (closingOffscreen) return;
  closingOffscreen = true;
  try {
    await withTimeout(
      chrome.offscreen.closeDocument(),
      TIMEOUTS.cleanup,
      { reason: STARTUP_REASON.STARTUP_TIMEOUT, stage: STARTUP_STAGE.CLEANUP, detail: 'Closing the offscreen document timed out.' },
    );
  } catch {
    // Already closed, or Chrome is shutting it down.
  } finally {
    closingOffscreen = false;
  }
}

async function removeWindow(windowId) {
  if (!Number.isInteger(windowId)) return;
  try {
    await withTimeout(
      chrome.windows.remove(windowId),
      TIMEOUTS.cleanup,
      { reason: STARTUP_REASON.STARTUP_TIMEOUT, stage: STARTUP_STAGE.CLEANUP, detail: 'Closing the captions window timed out.' },
    );
  } catch {
    // The window may already be gone.
  }
}

async function cleanupStartup({ attemptId, stage, windowInfo, offscreenCreated, captureStarted, reason, detail }) {
  session = null;
  cancelCloseOffscreen();

  if (windowInfo?.created) {
    await removeWindow(windowInfo.windowId);
    if (captionsWindowId === windowInfo.windowId) captionsWindowId = null;
  } else if (Number.isInteger(windowInfo?.windowId)) {
    // A pre-existing window was reused; leave it open but tell it startup failed.
    await sendToCaptions(MSG.SESSION_STATE, {
      snapshot: {
        phase: 'error',
        error: { code: reason, message: detail || 'Captions could not start.' },
        sessionId: null,
        tabId: null,
        tabTitle: '',
        tabUrl: '',
        startedAt: null,
        captions: { interim: '', finals: [] },
        droppedFrames: 0,
      },
    });
  }

  if (offscreenCreated || captureStarted) {
    if (captureStarted) {
      await withTimeout(
        chrome.runtime.sendMessage({ target: TARGET.OFFSCREEN, type: MSG.CAPTURE_STOP, reason: 'startup_failed' }),
        TIMEOUTS.cleanup,
        { reason: STARTUP_REASON.STARTUP_TIMEOUT, stage: STARTUP_STAGE.CLEANUP, detail: 'Stopping capture timed out.' },
      ).catch(() => undefined);
    }
    await closeOffscreen(true);
  }

  recordStartup(attemptId, stage, reason, detail, false);
}

async function startSession(message) {
  if (session?.active) {
    if (Number.isInteger(captionsWindowId)) {
      try { await chrome.windows.update(captionsWindowId, { focused: true }); } catch {}
    }
    return { ok: true, alreadyRunning: true, windowId: captionsWindowId };
  }
  if (starting) return { ok: true, alreadyRunning: true, starting: true };
  if (!Number.isInteger(message.tabId)) return startupFailure(STARTUP_REASON.NO_TAB, 'validate');
  starting = true;
  try {
    return await startSessionNow(message);
  } finally {
    starting = false;
  }
}

async function startSessionNow(message) {
  const attemptId = typeof message.attemptId === 'string'
    ? message.attemptId.slice(0, 80)
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let stage = STARTUP_STAGE.STREAM_ID;
  let windowInfo = null;
  let offscreenCreated = false;
  let captureStarted = false;

  try {
    // The offscreen document is authoritative after a service-worker restart.
    if (await hasOffscreen()) {
      const existing = await sendTo(TARGET.OFFSCREEN, MSG.SESSION_SNAPSHOT, {}, 2000);
      if (existing?.snapshot && isActivePhase(existing.snapshot.phase)) {
        const windowId = Number.isInteger(captionsWindowId) ? captionsWindowId : await findOpenCaptionsWindow();
        if (Number.isInteger(windowId)) {
          captionsWindowId = windowId;
          try { await chrome.windows.update(windowId, { focused: true }); } catch {}
        }
        return { ok: true, alreadyRunning: true, windowId };
      }
    }

    // 1. Obtain the stream ID while the toolbar invocation is still fresh.
    let streamId;
    try {
      streamId = await withTimeout(
        chrome.tabCapture.getMediaStreamId({ targetTabId: message.tabId }),
        TIMEOUTS.streamId,
        {
          reason: STARTUP_REASON.STREAM_ID_TIMEOUT,
          stage: STARTUP_STAGE.STREAM_ID,
          detail: 'chrome.tabCapture.getMediaStreamId did not resolve in time.',
        },
      );
    } catch (error) {
      throw normaliseStartupError(error, STARTUP_STAGE.STREAM_ID);
    }
    if (!streamId) {
      throw new StartupError(STARTUP_REASON.STREAM_ID_FAILED, STARTUP_STAGE.STREAM_ID, 'No stream id was returned.');
    }

    // 2. Backend preflight.
    stage = STARTUP_STAGE.BACKEND;
    const backend = await backendStatus();
    if (!backend.ok) {
      throw new StartupError(backend.reason, STARTUP_STAGE.BACKEND, 'Backend preflight failed.');
    }

    // 3. Offscreen document, then the visible captions window.
    stage = STARTUP_STAGE.OFFSCREEN;
    offscreenCreated = await ensureOffscreen();

    stage = STARTUP_STAGE.CAPTIONS_WINDOW;
    windowInfo = await ensureCaptionsWindow();

    // 4. Start capture in the offscreen document.
    stage = STARTUP_STAGE.CAPTURE_START;
    let response;
    try {
      response = await withTimeout(
        chrome.runtime.sendMessage({
          target: TARGET.OFFSCREEN,
          type: MSG.CAPTURE_START,
          streamId,
          sessionId: attemptId,
          tabId: message.tabId,
          tabTitle: typeof message.tabTitle === 'string' ? message.tabTitle : '',
          tabUrl: typeof message.tabUrl === 'string' ? message.tabUrl : '',
        }),
        TIMEOUTS.captureStart,
        {
          reason: STARTUP_REASON.CAPTURE_TIMEOUT,
          stage: STARTUP_STAGE.CAPTURE_START,
          detail: 'The offscreen document did not answer capture.start.',
        },
      );
    } catch (error) {
      throw normaliseStartupError(error, STARTUP_STAGE.CAPTURE_START);
    }
    if (!response?.ok) {
      throw new StartupError(
        response?.reason ?? STARTUP_REASON.CAPTURE_FAILED,
        STARTUP_STAGE.CAPTURE_START,
        response?.detail ?? 'The offscreen document rejected capture.start.',
      );
    }
    captureStarted = true;

    session = {
      active: true,
      sessionId: attemptId,
      tabId: message.tabId,
      tabTitle: typeof message.tabTitle === 'string' ? message.tabTitle : '',
      tabUrl: typeof message.tabUrl === 'string' ? message.tabUrl : '',
      startedAt: Date.now(),
      windowId: windowInfo?.windowId ?? null,
    };
    cancelCloseOffscreen();
    recordStartup(attemptId, STARTUP_STAGE.STARTED, null, null, true);

    await sendToCaptions(MSG.SESSION_STATE, {
      snapshot: {
        phase: 'starting',
        error: null,
        sessionId: session.sessionId,
        tabId: session.tabId,
        tabTitle: session.tabTitle,
        tabUrl: session.tabUrl,
        startedAt: session.startedAt,
        captions: { interim: '', finals: [] },
        droppedFrames: 0,
      },
    });

    return { ok: true, attemptId, windowId: session.windowId };
  } catch (error) {
    const failure = normaliseStartupError(error, stage);
    await cleanupStartup({
      attemptId,
      stage: failure.stage,
      windowInfo,
      offscreenCreated,
      captureStarted,
      reason: failure.reason,
      detail: failure.detail,
    });
    return startupFailure(failure.reason, failure.stage, failure.detail);
  }
}

async function stopSession(reason = 'user') {
  const wasActive = Boolean(session?.active);
  session = null;

  if (await hasOffscreen()) {
    await sendTo(TARGET.OFFSCREEN, MSG.CAPTURE_STOP, { reason });
  } else if (wasActive) {
    await sendToCaptions(MSG.SESSION_STATE, {
      snapshot: {
        phase: 'stopped',
        error: null,
        sessionId: null,
        tabId: null,
        tabTitle: '',
        tabUrl: '',
        startedAt: null,
        captions: { interim: '', finals: [] },
        droppedFrames: 0,
      },
    });
  }

  scheduleCloseOffscreen();
  return { ok: true, wasActive };
}

async function currentStatus() {
  if (await hasOffscreen()) {
    const response = await sendTo(TARGET.OFFSCREEN, MSG.SESSION_SNAPSHOT, {}, 2000);
    if (response?.snapshot) {
      return { ok: true, active: isActivePhase(response.snapshot.phase), snapshot: response.snapshot };
    }
  }
  return { ok: true, active: false, snapshot: null };
}

async function diagnostics() {
  return {
    ok: true,
    active: Boolean(session?.active),
    starting,
    windowId: captionsWindowId,
    offscreen: await hasOffscreen(),
    lastStartup,
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.target !== TARGET.BACKGROUND) return undefined;

  if (message.type === MSG.MEETING_START) {
    startSession(message)
      .then(sendResponse)
      .catch((error) => sendResponse(startupFailure(
        STARTUP_REASON.STARTUP_TIMEOUT,
        'unexpected',
        error?.message ?? String(error),
      )));
    return true;
  }
  if (message.type === MSG.MEETING_STOP) {
    stopSession(message.reason ?? 'user')
      .then(sendResponse)
      .catch(() => sendResponse({ ok: false, reason: 'stop_failed' }));
    return true;
  }
  if (message.type === MSG.MEETING_STATUS) {
    currentStatus()
      .then(sendResponse)
      .catch(() => sendResponse({ ok: true, active: false, snapshot: null }));
    return true;
  }
  if (message.type === MSG.MEETING_DIAGNOSTICS) {
    diagnostics().then(sendResponse);
    return true;
  }
  if (message.type === MSG.CAPTIONS_READY) {
    if (Number.isInteger(message.windowId)) captionsWindowId = message.windowId;
    sendResponse({ ok: true });
    return false;
  }
  if (message.type === MSG.CAPTURE_ENDED) {
    if (session?.active && message.sessionId && message.sessionId !== session.sessionId) {
      sendResponse({ ok: true, stale: true });
      return false;
    }
    if (!session && starting) {
      sendResponse({ ok: true, stale: true });
      return false;
    }
    session = null;
    scheduleCloseOffscreen();
    sendResponse({ ok: true });
    return false;
  }

  sendResponse({ ok: false, reason: 'unknown_message' });
  return false;
});

chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId !== captionsWindowId) return;
  captionsWindowId = null;
  if (session?.active) stopSession('captions_window_closed');
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (session?.active && tabId === session.tabId) stopSession('tab_closed');
});
