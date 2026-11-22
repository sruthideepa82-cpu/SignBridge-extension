// Shared startup and messaging diagnostics. These helpers contain no audio or transcript data.

export const STARTUP_STAGE = Object.freeze({
  STREAM_ID: 'stream_id',
  BACKEND: 'backend',
  OFFSCREEN: 'offscreen',
  CAPTIONS_WINDOW: 'captions_window',
  CAPTURE_START: 'capture_start',
  CLEANUP: 'cleanup',
  STARTED: 'started',
});

export const STARTUP_REASON = Object.freeze({
  BACKEND_DOWN: 'backend_down',
  TRANSCRIPTION_UNAVAILABLE: 'transcription_unavailable',
  STREAM_ID_FAILED: 'stream_id_failed',
  STREAM_ID_TIMEOUT: 'stream_id_timeout',
  OFFSCREEN_FAILED: 'offscreen_failed',
  OFFSCREEN_TIMEOUT: 'offscreen_timeout',
  WINDOW_FAILED: 'window_create_failed',
  WINDOW_TIMEOUT: 'window_timeout',
  CAPTURE_FAILED: 'capture_failed',
  CAPTURE_TIMEOUT: 'capture_timeout',
  CAPTURE_NOT_ALLOWED: 'capture_not_allowed',
  STARTUP_TIMEOUT: 'startup_timeout',
  WORKER_UNAVAILABLE: 'worker_unavailable',
  WORKER_CLOSED: 'worker_closed',
  WORKER_TIMEOUT: 'worker_timeout',
  WORKER_NO_RESPONSE: 'worker_no_response',
  EXTENSION_RELOADED: 'extension_reloaded',
  WORKER_ERROR: 'worker_error',
  ALREADY_RUNNING: 'already_running',
  NO_TAB: 'no_tab',
});

export class StartupError extends Error {
  constructor(reason, stage, detail = '', cause = null) {
    super(detail || reason);
    this.name = 'StartupError';
    this.reason = reason;
    this.stage = stage;
    this.detail = detail ? String(detail).slice(0, 400) : '';
    this.cause = cause;
  }
}

export function isStartupError(error) {
  return error instanceof StartupError;
}

// Resolves or rejects with a StartupError after `ms`. The timer is always cleared, so a late rejection does not leak.
export function withTimeout(promise, ms, { reason, stage, detail = '' } = {}) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new StartupError(reason ?? STARTUP_REASON.STARTUP_TIMEOUT, stage ?? STARTUP_STAGE.CLEANUP, detail));
    }, ms);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

// Maps a runtime.sendMessage rejection to a safe category. Raw messages are kept only as technical detail.
export function classifyRuntimeError(error) {
  const detail = String(error?.message ?? error ?? 'Unknown messaging error').slice(0, 400);
  if (/context invalidated|extension context invalidated/i.test(detail)) {
    return { reason: STARTUP_REASON.EXTENSION_RELOADED, detail };
  }
  if (/receiving end does not exist|could not establish connection/i.test(detail)) {
    return { reason: STARTUP_REASON.WORKER_UNAVAILABLE, detail };
  }
  if (/message port closed|port closed before a response/i.test(detail)) {
    return { reason: STARTUP_REASON.WORKER_CLOSED, detail };
  }
  if (/no tab with id|invalid tab id|tab was closed/i.test(detail)) {
    return { reason: STARTUP_REASON.NO_TAB, detail };
  }
  return { reason: STARTUP_REASON.WORKER_ERROR, detail };
}

// Sends one message and always resolves to a response-shaped object. It never returns null, so the popup cannot fall
// back to a generic "did not start" message when the worker or port disappears.
export async function sendMeetingMessage(sendMessage, message, { timeoutMs = 20000, stage = 'startup' } = {}) {
  try {
    const response = await withTimeout(
      Promise.resolve().then(() => sendMessage(message)),
      timeoutMs,
      { reason: STARTUP_REASON.WORKER_TIMEOUT, stage, detail: 'Background worker did not answer in time.' },
    );
    if (response === undefined || response === null) {
      return {
        ok: false,
        reason: STARTUP_REASON.WORKER_NO_RESPONSE,
        stage,
        detail: 'Background worker returned no response.',
      };
    }
    if (typeof response !== 'object') {
      return {
        ok: false,
        reason: STARTUP_REASON.WORKER_ERROR,
        stage,
        detail: `Unexpected response type: ${typeof response}`,
      };
    }
    return response;
  } catch (error) {
    if (isStartupError(error)) {
      return { ok: false, reason: error.reason, stage: error.stage, detail: error.detail };
    }
    const classified = classifyRuntimeError(error);
    return { ok: false, reason: classified.reason, stage, detail: classified.detail };
  }
}

export function startupFailure(reason, stage, detail = '') {
  return {
    ok: false,
    reason,
    stage,
    detail: detail ? String(detail).slice(0, 400) : '',
  };
}
