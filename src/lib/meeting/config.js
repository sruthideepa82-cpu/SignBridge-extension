import { API_BASE, BACKEND_ORIGIN } from '../config.js';

// Meeting captions configuration. Kept separate from the letter-recognition settings so the Day 2 behaviour
// cannot change when caption limits are tuned.

export const CAPTIONS_PAGE = 'captions.html';
export const OFFSCREEN_PAGE = 'offscreen.html';
export const WORKLET_FILE = 'worklet.js';

export const TRANSCRIPTION_PATH = '/transcription/live';
export const TRANSCRIPTION_LANGUAGES = Object.freeze(['auto', 'en-IN', 'hi-IN']);
export const DEFAULT_LANGUAGE = 'auto';

export const TARGET_SAMPLE_RATE = 16000;
export const FRAME_MS = 100;
export const FRAME_SAMPLES = (TARGET_SAMPLE_RATE * FRAME_MS) / 1000;
export const FRAME_BYTES = FRAME_SAMPLES * 2;
export const MAX_FRAME_BYTES = 32000;

// The backend rotates its Gemini session every 9 minutes and caps one browser connection at 30 minutes.
export const MAX_SESSION_MS = 30 * 60 * 1000;
export const RECONNECT_DELAYS_MS = Object.freeze([500, 1000, 2000, 4000, 8000]);
export const READY_TIMEOUT_MS = 10000;
export const PING_INTERVAL_MS = 15000;
export const PONG_TIMEOUT_MS = 5000;
export const STOP_GRACE_MS = 400;
export const MAX_QUEUED_FRAMES = 10;
export const MAX_BUFFERED_BYTES = 64000;
export const MAX_FINALS = 300;

export const BACKEND_STATUS_PATH = '/transcription/status';

export function buildTranscriptionSocketUrl(base = API_BASE, origin = BACKEND_ORIGIN) {
  const url = new URL(base, origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `${url.pathname.replace(/\/+$/, '')}${TRANSCRIPTION_PATH}`;
  url.search = '';
  url.hash = '';
  return url.toString();
}
