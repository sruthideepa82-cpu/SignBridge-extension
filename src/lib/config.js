// The local SignBridge backend. The address matches the documented start command:
//   uvicorn app.main:app --host 127.0.0.1 --port 8000
// The manifest's host permission must name exactly the same origin.
export const BACKEND_ORIGIN = 'http://127.0.0.1:8000';
export const API_BASE = `${BACKEND_ORIGIN}/api`;

// How often the popup asks for the newest recognition result while recognition is running.
export const POLL_INTERVAL_MS = 200;

// A request that gets no answer within this time is reported as a connection problem.
export const REQUEST_TIMEOUT_MS = 4000;

// Starting or stopping the camera opens or releases the webcam and loads or unloads the detectors, which can take
// several seconds. Those requests get a longer wait so a slow start is not reported as an unreachable backend.
export const CAMERA_CONTROL_TIMEOUT_MS = 20000;

// Composer: a letter is added only after the same letter is recognised in this many distinct frames in a row, and at
// least COMPOSER_COOLDOWN_MS after the previous letter was added. The same letter cannot be added again until the
// recognition has shown no letter or a different one.
export const COMPOSER_STABLE_FRAMES = 6;
export const COMPOSER_COOLDOWN_MS = 1000;
