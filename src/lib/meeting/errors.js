import { STARTUP_REASON } from './startup.js';

// Plain-language meeting-captions messages. No transcript or audio content is ever passed in here.

export const CAPTURE_ERROR = Object.freeze({
  PERMISSION_DENIED: 'capture_permission_denied',
  NO_DEVICE: 'capture_no_device',
  DEVICE_BUSY: 'capture_device_busy',
  TRACK_ENDED: 'capture_track_ended',
  CONTEXT_FAILED: 'capture_context_failed',
  WORKLET_FAILED: 'capture_worklet_failed',
  CAPTURE_FAILED: 'capture_failed',
});

const CAPTURE_MESSAGES = {
  [CAPTURE_ERROR.PERMISSION_DENIED]:
    'Chrome did not allow audio capture for this tab. Click the SignBridge toolbar icon on the tab and try again.',
  [CAPTURE_ERROR.NO_DEVICE]:
    'The tab did not provide an audio stream. Make sure something is playing in the tab.',
  [CAPTURE_ERROR.DEVICE_BUSY]:
    'The tab audio could not be read. Close other capture tools and try again.',
  [CAPTURE_ERROR.TRACK_ENDED]:
    'The tab stopped providing audio, or the tab was closed. Captions have stopped.',
  [CAPTURE_ERROR.CONTEXT_FAILED]:
    'The browser could not start audio processing for this tab.',
  [CAPTURE_ERROR.WORKLET_FAILED]:
    'The browser could not load the audio processing step. Reload the extension and try again.',
  [CAPTURE_ERROR.CAPTURE_FAILED]:
    'Tab audio capture could not start. Click the SignBridge toolbar icon on the tab and try again.',
};

const TRANSPORT_MESSAGES = {
  origin_rejected:
    'SignBridge closed the caption connection before it started. Make sure the backend is running and that this extension\'s origin is listed in SIGNBRIDGE_CORS_ORIGINS, then restart the backend.',
  backend_unreachable:
    'The SignBridge backend is not reachable. Start it on this computer, then start captions again.',
  connection_failed:
    'The caption connection could not be opened. Check the backend and try again.',
  reconnect_exhausted:
    'Captions could not reconnect to SignBridge. Check the backend, then start again.',
  ready_timeout:
    'SignBridge did not answer the caption session in time. Start again.',
  pong_timeout:
    'The caption connection stopped responding. Start again.',
  transcription_unavailable:
    'Speech transcription is not configured on the backend. Add GEMINI_API_KEY to backend/.env and restart it.',
  gemini_auth_failed:
    'Gemini rejected the backend API key. Check GEMINI_API_KEY on the backend.',
  gemini_model_unavailable:
    'The Gemini live transcription model is not available to this key.',
  gemini_rate_limited:
    'Gemini rate or quota limit reached. Wait a moment, then start again.',
  gemini_request_rejected:
    'Gemini rejected the audio stream. Start again, and check the backend console if it repeats.',
  gemini_unavailable:
    'Gemini is temporarily unavailable. Try again shortly.',
  gemini_disconnected:
    'The Gemini connection was interrupted. Captions will reconnect.',
  gemini_session_ended:
    'The Gemini transcription session ended. Start captions again.',
  too_many_sessions:
    'Too many transcription sessions are open. Stop another session and try again.',
  session_time_limit:
    'This caption session reached the 30 minute limit. Start again to continue.',
  frame_too_large:
    'An audio frame was too large for the backend. Stop and start captions again.',
  invalid_start:
    'The caption request was rejected by the backend. Reload the extension and try again.',
  tab_closed:
    'The captured tab was closed, so captions have stopped.',
  captions_window_closed:
    'The captions window was closed, so capture has stopped.',
  user:
    'Captions stopped.',
};

export function describeCaptureError(code) {
  return CAPTURE_MESSAGES[code] ?? CAPTURE_MESSAGES[CAPTURE_ERROR.CAPTURE_FAILED];
}

export function describeTransportError(errorOrCode) {
  const code = typeof errorOrCode === 'string' ? errorOrCode : errorOrCode?.code;
  return TRANSPORT_MESSAGES[code] ?? 'Captions stopped because of a connection problem. Start again.';
}

export function captureErrorForMediaError(error) {
  const name = error?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return CAPTURE_ERROR.PERMISSION_DENIED;
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return CAPTURE_ERROR.NO_DEVICE;
  if (name === 'NotReadableError' || name === 'AbortError') return CAPTURE_ERROR.DEVICE_BUSY;
  return CAPTURE_ERROR.CAPTURE_FAILED;
}

export function describeStartFailure(response) {
  if (!response || typeof response !== 'object') {
    return 'SignBridge did not receive a startup response. Reload the extension, reopen the popup and try again.';
  }
  const messages = {
    [STARTUP_REASON.ALREADY_RUNNING]: 'Captions are already running in the captions window.',
    [STARTUP_REASON.NO_TAB]: 'No active tab was found. Open the tab you want to caption and try again.',
    [STARTUP_REASON.BACKEND_DOWN]: 'The SignBridge backend is not running. Start it, then try again.',
    [STARTUP_REASON.TRANSCRIPTION_UNAVAILABLE]:
      'The backend has no Gemini transcription key configured. Add it to backend/.env and restart the backend.',
    [STARTUP_REASON.STREAM_ID_FAILED]:
      'Chrome did not allow audio capture for this tab. Click the SignBridge toolbar icon on the tab you want to caption, then try again.',
    [STARTUP_REASON.STREAM_ID_TIMEOUT]:
      'Chrome did not return a tab-capture stream in time. Reopen the popup on the tab you want to caption and try again.',
    [STARTUP_REASON.CAPTURE_NOT_ALLOWED]:
      'Chrome did not allow audio capture for this tab. Click the SignBridge toolbar icon on the tab you want to caption, then try again.',
    [STARTUP_REASON.OFFSCREEN_FAILED]:
      'The caption audio process could not start. Reload the extension and try again.',
    [STARTUP_REASON.OFFSCREEN_TIMEOUT]:
      'The caption audio process did not start in time. Reload the extension and try again.',
    [STARTUP_REASON.WINDOW_FAILED]:
      'Chrome could not open the captions window. Close extra browser windows, then try again.',
    [STARTUP_REASON.WINDOW_TIMEOUT]:
      'Chrome did not open the captions window in time. Try again, or restart Chrome if it keeps happening.',
    [STARTUP_REASON.CAPTURE_FAILED]:
      'Tab audio capture could not start. Make sure audio is playing in the tab and try again.',
    [STARTUP_REASON.CAPTURE_TIMEOUT]:
      'The caption audio process did not answer in time. Reload the extension and try again.',
    [STARTUP_REASON.STARTUP_TIMEOUT]:
      'Captions took too long to start. Reload the extension and try again.',
    [STARTUP_REASON.WORKER_UNAVAILABLE]:
      'SignBridge\'s background worker is not running. Open chrome://extensions, click Reload on SignBridge, then reopen the popup.',
    [STARTUP_REASON.WORKER_CLOSED]:
      'The background worker closed before captions started. Reopen the popup and try again.',
    [STARTUP_REASON.WORKER_TIMEOUT]:
      'The background worker did not answer in time. Reload the extension, reopen the popup and try again.',
    [STARTUP_REASON.WORKER_NO_RESPONSE]:
      'The background worker returned no answer. Reload the extension, reopen the popup and try again.',
    [STARTUP_REASON.EXTENSION_RELOADED]:
      'SignBridge was reloaded while this popup was open. Reopen the popup and try again.',
    [STARTUP_REASON.WORKER_ERROR]:
      'The background worker could not start captions. Reload the extension and try again.',
  };
  const base = messages[response.reason] ?? 'Captions could not start. Try again.';
  const detailReasons = new Set([
    STARTUP_REASON.STREAM_ID_FAILED,
    STARTUP_REASON.STREAM_ID_TIMEOUT,
    STARTUP_REASON.OFFSCREEN_FAILED,
    STARTUP_REASON.OFFSCREEN_TIMEOUT,
    STARTUP_REASON.WINDOW_FAILED,
    STARTUP_REASON.WINDOW_TIMEOUT,
    STARTUP_REASON.CAPTURE_FAILED,
    STARTUP_REASON.CAPTURE_TIMEOUT,
    STARTUP_REASON.STARTUP_TIMEOUT,
    STARTUP_REASON.WORKER_UNAVAILABLE,
    STARTUP_REASON.WORKER_CLOSED,
    STARTUP_REASON.WORKER_TIMEOUT,
    STARTUP_REASON.WORKER_NO_RESPONSE,
    STARTUP_REASON.WORKER_ERROR,
  ]);
  const detail = detailReasons.has(response.reason)
    && typeof response.detail === 'string'
    && response.detail.trim()
    ? ` Details: ${response.detail.trim().slice(0, 240)}`
    : '';
  return `${base}${detail}`;
}
