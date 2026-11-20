import { BACKEND_ORIGIN } from './config.js';

// Plain-language messages for every error the popup can show. Each one says what to do next.
const MESSAGES = {
  backend_unreachable:
    `SignBridge is not running on this computer. Start the backend, which listens at ${BACKEND_ORIGIN}, then try again.`,
  backend_timeout:
    `SignBridge did not answer at ${BACKEND_ORIGIN}. Check that the backend is running and not stuck, then try again.`,
  camera_unavailable:
    'The webcam could not be opened. Check that a camera is connected and enabled, close other apps that use it, then try again.',
  camera_not_running:
    'The camera is not running. Press Start recognition first.',
  no_model:
    'The recognition model is not available on the backend, so no letter can be shown.',
  http_404:
    'This backend does not provide the recognition endpoints. Restart it from the current SignBridge code.',
  internal_error:
    'The backend hit an unexpected error. Look at the backend console for details, then try again.',
};

export function messageForError(code, timedOut = false, backendMessage = null) {
  if (code === 'backend_unreachable') {
    return timedOut ? MESSAGES.backend_timeout : MESSAGES.backend_unreachable;
  }
  if (MESSAGES[code]) return MESSAGES[code];
  if (backendMessage) return backendMessage;
  return 'Something went wrong while talking to SignBridge. Try again.';
}
