# SignBridge Extension: architecture

Status: Day 1 implemented. Scope is the popup only. The floating widget, the text composer, speech, copy and insert are not built.

## 1. Components

```
Chrome or Edge (Manifest V3)
  Popup (React, popup.html)
    src/popup/App.jsx            Layout: status, start/stop, letter display, honest footer
    src/popup/useRecognition.js  Connection state, camera state, 200 ms polling while the camera runs
    src/lib/apiClient.js         fetch wrapper: timeout, error codes, backend_unreachable
    src/lib/recognition.js       Turns a backend response into what the popup may show
    src/lib/messages.js          Plain-language messages for every error code
    src/lib/config.js            Backend origin, API base, poll interval, request timeout
                  │
                  │ HTTP, allowed by host_permissions http://127.0.0.1:8000/*
                  ▼
Local SignBridge backend (separate repository, unchanged)
  FastAPI on 127.0.0.1:8000, /api prefix
  OpenCV camera, MediaPipe hand landmarks, RandomForest letter model (experimental)
```

There is no service worker in Day 1. The popup owns all state, and polling runs only while the popup is open.

## 2. Backend contract used

| Call | Used for | Fields read |
| --- | --- | --- |
| `GET /api/health` | Reachability (available, not yet called by the popup) | `status` |
| `GET /api/camera/status` | Initial state on popup open | `running`, `last_error` |
| `POST /api/camera/start` | Start recognition | `running`, `last_error` |
| `POST /api/camera/stop` | Stop recognition | none |
| `GET /api/recognition/latest` | Polled every 200 ms while running | `status`, `label`, `confidence`, `threshold`, `experimental`, `detail` |

Errors use the backend's shape: `{ "error": { "code", "message" } }`. The client keeps the `code` and maps it to a message.
An unreachable backend or timeout becomes `backend_unreachable`, which is never shown as an empty result.

Recognition statuses handled: `recognized`, `uncertain`, `no_hand`, `two_hands`, `camera_off`, `no_model`. Any other
value is shown as "Unknown status" and no letter is shown.

## 3. Display rules

- A letter is shown only for status `recognized` with a single letter A to Z.
- `uncertain`, `no_hand`, `two_hands`, `camera_off` and `no_model` never show a letter.
- A missing `experimental` field is treated as experimental, so an unlabelled result is never shown as verified.
- The label "Experimental: unverified dataset" is always visible. The footer states that this is single letters only and
  not a verified ISL translation.

## 4. Permissions and security

- `host_permissions`: `http://127.0.0.1:8000/*` only. Extension pages with a host permission are not restricted by the
  backend's CORS policy. This is why the backend's `SIGNBRIDGE_CORS_ORIGINS` does not need to change.
- No `permissions` entries. No camera permission: the backend opens the webcam.
- No content scripts, no `<all_urls>`, no remote code. The build emits no inline scripts, so the default extension
  content security policy applies.
- No secrets. The extension holds no API keys. Backend secrets stay in the SignBridge backend's `.env`.

## 5. Build and tests

- Build: Vite with `base: './'`, input `popup.html`, output `dist/`. `public/manifest.json` is copied into `dist/`.
- Tests: Vitest with jsdom. Four files, 33 tests:
  - `src/manifest.test.js`: Manifest V3, exact host permission, no extra permissions, no content scripts.
  - `src/lib/apiClient.test.js`: success, unreachable, timeout, backend error codes, invalid JSON.
  - `src/lib/recognition.test.js`: each status, letter validation, experimental labelling.
  - `src/popup/App.test.jsx`: connection state, start, stop, webcam errors, and letter display rules, with a mocked API.

## 6. Origin of the code

All source in this repository was written for the extension. Nothing was copied from the SignBridge frontend in Day 1.
The design reuses the backend contract and the honest-status rules of the SignBridge project. `docs/EXTENSION_AUDIT.md`
lists frontend modules that may be reused later (`sentenceEditor.js`, `speech.js`, `speechPreferences.js`,
`letterSettings.js`, `useSignBuffer.js`). When any of them is copied, its origin and license must be recorded here.
The SignBridge repository has no LICENSE file at the time of writing, so any such copy needs the owner's permission first.

## 7. Known limits

- The backend must run on the same computer, with a working webcam.
- Only the 16 letters of the static classifier are possible: A, B, C, D, F, G, I, K, M, N, P, R, S, T, W, X.
- Recognition is single-frame, so it does not understand ISL words or sentences.
- The model is unverified. Its reported test accuracy is not signer-independent and is not real-world accuracy.
- The camera keeps running after the popup closes until **Stop recognition** is pressed.
