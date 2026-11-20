# SignBridge Extension

A Chrome and Edge Manifest V3 extension that shows the **experimental** fingerspelling-letter recognition of the local
SignBridge backend. It is a client of that backend. It does not recognise signs itself, and it is not a verified ISL
translator.

This repository is independent of the SignBridge backend repository. It has its own Git history and no remote. The
backend and its AI engine are not copied here.

## Status (Day 1)

- Manifest V3 popup (React, built with Vite).
- Checks that the local backend is reachable at `http://127.0.0.1:8000`.
- Starts and stops recognition through `POST /api/camera/start` and `POST /api/camera/stop`.
- Shows the newest result from `GET /api/recognition/latest` and displays a letter only when the backend reports `recognized`.
- Shows a live webcam preview while recognition runs. It reads the backend's existing `GET /api/camera/stream` (MJPEG)
  and does not open a second camera. It shows loading, paused (backend unreachable) and error states with a Retry button.
- Glassmorphism popup (360 px wide, fits Chrome's 600 px popup height): the live camera card with status and
  Start/Stop, the recognised letter with a confidence bar and threshold marker, the experimental warning, and a footer.
- Starting or stopping the camera waits up to 20 seconds, because opening the webcam can take several seconds.
- Message composer (Day 2):
  - A recognised letter is added only after it is stable: the same letter in 6 distinct frames in a row, at least 1
    second after the previous letter (`COMPOSER_STABLE_FRAMES` and `COMPOSER_COOLDOWN_MS` in `src/lib/config.js`).
  - Holding a letter adds it once. The same letter is added again only after the hand shows no letter or a different one.
  - Space, Backspace and Clear edit the message. You can also type in the message box. Recognition only appends letters.
  - **Copy** uses the Clipboard API. **Speak** and **Stop speaking** use SpeechSynthesis, and only after a click.
  - **Insert into page** writes into the focused text box, text area or editable area of the active tab. It keeps the
    existing text, puts the caret after the new text, and fires an input event. It never presses Enter, submits a form
    or sends a message. Password fields, read-only fields and iframes are not supported.
- Shows plain-language errors for an unreachable backend, a camera that will not open, a missing model, and timeouts.
- Not yet built: floating widget, text composer, text-to-speech, copy and insert. These are planned for later days.

The extension does **not** open the webcam. The backend owns the camera.

## Requirements

- Node.js 20.19 or newer (22 LTS recommended) and npm.
- The SignBridge backend, running on this computer, with its own `backend/.env` and Python environment.
- A webcam connected to this computer, for recognition.

## Backend connection

| Item | Value |
| --- | --- |
| Backend origin | `http://127.0.0.1:8000` |
| API base | `http://127.0.0.1:8000/api` |
| Start command (run in the SignBridge `backend` folder) | `uvicorn app.main:app --reload --host 127.0.0.1 --port 8000` |
| Source of truth | `src/lib/config.js` (`BACKEND_ORIGIN`) and `public/manifest.json` (`host_permissions`). Both must name the same origin. |

Port 8000 is the port documented by the SignBridge backend. An earlier audit ran a second copy of the backend on port
8001 for verification only. The extension uses 8000.

## Permissions

- `host_permissions`: `http://127.0.0.1:8000/*` only. This lets extension pages call the backend without changing the
  backend's CORS settings.
- `permissions`: `activeTab`, `scripting` and `storage`, and nothing else.
  - `storage` keeps the composed message in `chrome.storage.session` while the popup is closed and reopened. This
    storage lives in memory only, is cleared when the browser closes, and is never written to disk or synced. No
    `storage.local` or `storage.sync` is used.
  - `scripting` runs one small function in the page, and only when the user presses **Insert into page**.
  - `activeTab` limits that to the tab the user is looking at, and only after the user invokes SignBridge.
  - No content scripts, no `<all_urls>`, no access to other websites, no camera permission, no `tabs` or `storage`.
  - A content script was not used because it would have to run on every page all the time.

## Install and run

1. Start the backend (see the table above).

2. Install and build the extension:

   ```
   npm ci
   npm run build
   ```

3. Load it unpacked:
   - Open `chrome://extensions` (or `edge://extensions`) and turn on **Developer mode**.
   - Click **Load unpacked** and choose the `dist` folder inside this repository.
   - Open the SignBridge popup from the toolbar.

Rebuild with `npm run build` after changing source files, then click **Reload** on the extension card.

## Tests

```
npm test
```

The tests use a mocked `fetch`. They do not need the backend, a webcam or a browser. They cover the manifest, the
backend client (unreachable, timeout and error codes, stream URL), the recognition rules, the live preview states and
the popup's start, stop, error and popup-reopen behaviour.

## Repository layout

```
SignBridge-Extension/
  public/manifest.json      Manifest V3 configuration
  popup.html                Popup entry page
  src/popup/                React popup (App, state hook, styles)
  src/lib/                  Backend client, configuration, messages, recognition rules
  src/test/                 Test setup
  docs/                     Architecture and audit documents
  vite.config.js            Build configuration (outputs dist/)
  package.json              Scripts and dependencies
```

Architecture details are in `docs/ARCHITECTURE.md`. The original audit is in `docs/EXTENSION_AUDIT.md`.

## Limitations

- Single fingerspelled letters only (A, B, C, D, F, G, I, K, M, N, P, R, S, T, W, X). No words, sentences or continuous signing.
- The model is marked `unverified_dataset`. Its reported accuracy comes from a public dataset split that is not
  signer-independent. It is not real-world accuracy.
- Closing the popup does not stop the backend camera. Use **Stop recognition** first.
- The live preview exists only while recognition runs. It is served by the backend to this computer only.
- The message is kept for the current browser session (`chrome.storage.session`). It is cleared when the browser closes.
- The popup has two tabs, **Live** and **Message**. Both tabs stay loaded, so switching does not restart the camera,
  recognition polling or letter accumulation. The Live tab is 598 px tall and the Message tab 448 px, within Chrome's
  600 px popup limit.
- Recognition works only while the local backend runs on the same computer.
- The toolbar and extension-page icon is the SignBridge character, in `public/icons/` at 16, 32, 48 and 128 px. The
  master artwork is kept in `assets/branding/`.
