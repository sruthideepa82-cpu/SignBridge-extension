# SignBridge Extension

A Chrome and Edge Manifest V3 extension for two things:

1. **Experimental fingerspelling-letter recognition** from the local SignBridge backend (existing Day 1–2 feature).
2. **Experimental meeting captions** that capture audio from a Google Meet tab and show live captions in a separate
   SignBridge window (Phase 1 feature).

It is a client of the local SignBridge backend. It does not recognise signs itself, and it is not a verified ISL
translator. Meeting captions have **not yet been verified with a real Google Meet call**; the manual test matrix is in
`docs/MEETING_MODE_TEST_MATRIX.md`.

This repository is independent of the SignBridge backend repository. The backend and its AI engine are not copied here.

## Status

### Signing (existing)

- Manifest V3 popup (React, built with Vite).
- Checks that the local backend is reachable at `http://127.0.0.1:8000`.
- Starts and stops recognition through `POST /api/camera/start` and `POST /api/camera/stop`.
- Shows the newest result from `GET /api/recognition/latest` and displays a letter only when the backend reports
  `recognized`.
- Shows the backend's MJPEG preview; it never opens a second camera itself.
- Starts and stops the camera with a 20-second allowance, because opening the webcam can take several seconds.
- Message composer:
  - A letter is added only after it is stable: the same letter in 6 distinct frames in a row, at least 1 second after
    the previous letter (`COMPOSER_STABLE_FRAMES` and `COMPOSER_COOLDOWN_MS` in `src/lib/config.js`).
  - Holding a letter adds it once. The same letter is added again only after the hand shows no letter or a different one.
  - Space, Backspace and Clear edit the message. You can also type in the message box. Recognition only appends letters.
  - **Copy** uses the Clipboard API. **Speak** and **Stop speaking** use SpeechSynthesis, and only after a click.
  - **Insert into page** writes into the focused text box, text area or editable area of the active tab. It keeps the
    existing text, puts the caret after the new text, and fires an input event. It never presses Enter, submits a form
    or sends a message. Password fields, read-only fields and iframes are not supported.
- Plain-language errors for an unreachable backend, a camera that will not open, a missing model and timeouts.

The extension does **not** open the webcam. The backend owns the camera.

### Meeting captions (Phase 1)

Pipeline:

```
Google Meet tab audio → chrome.tabCapture → offscreen document
  → AudioWorklet → 16 kHz mono PCM → ws://127.0.0.1:8000/api/transcription/live
  → Gemini Live (relayed by the local backend) → caption state → separate SignBridge captions window
```

- The user must invoke the extension on the Meet tab, tick the consent checkbox, and press **Start meeting captions**.
- The popup opens the captions window. The offscreen document owns the tab stream, PCM processing, the WebSocket and
  the transcript. Closing the popup does not stop capture.
- **Stop captions** closes the tab stream, the audio graph and the WebSocket immediately. Closing the captions window,
  closing the captured tab, or reaching the 30-minute client limit also stops capture.
- The microphone is never used. Only audio from the selected tab is captured.
- Nothing is recorded or written to disk. The transcript lives in offscreen memory and the captions window only. It is
  not stored in `chrome.storage`, `localStorage`, IndexedDB or the backend.
- No audio or transcript text is logged by the extension.

Not in Phase 1: Meet DOM injection, automatic chat insertion, Document Picture-in-Picture, outgoing sign recognition
changes, camera coexistence fixes, new models or new dependencies.

## Requirements

- Node.js 20.19 or newer (22 LTS recommended) and npm.
- Chrome or Edge **116 or newer** (the manifest sets `minimum_chrome_version: 116`; service-worker → offscreen stream
  IDs need it).
- The SignBridge backend running on this computer, with `backend/.env` and a Python environment.
- For recognition: a webcam connected to this computer.
- For meeting captions: a Gemini-enabled backend (`GEMINI_API_KEY` in `backend/.env`).

## Backend connection and pinned origin

| Item | Value |
| --- | --- |
| Backend origin | `http://127.0.0.1:8000` |
| API base | `http://127.0.0.1:8000/api` |
| Transcription socket | `ws://127.0.0.1:8000/api/transcription/live` |
| Start command (in the SignBridge `backend` folder) | `uvicorn app.main:app --host 127.0.0.1 --port 8000` |
| Source of truth | `src/lib/config.js`, `src/lib/meeting/config.js` and `public/manifest.json` |

The extension's HTTP calls use `host_permissions` for `http://127.0.0.1:8000/*` and are not subject to the backend's
CORS rules. The transcription WebSocket is different: the backend checks the `Origin` header itself and closes a
connection from an unknown origin.

The extension ID is **pinned** by the public `key` in `public/manifest.json`:

```
chrome-extension://hfccobalkbgnibbjlmjmpjkffleccace
```

The backend `.env` must include that exact origin:

```
SIGNBRIDGE_CORS_ORIGINS=["http://localhost:5173","http://127.0.0.1:5173","chrome-extension://hfccobalkbgnibbjlmjmpjkffleccace"]
```

No wildcard is used, and the existing website origins stay in the list. Changing the `key` changes the extension ID and
requires updating the backend list. The matching **private** key is not in this repository; it is only needed if the
extension is packaged/signed. See `docs/ARCHITECTURE.md` for the maintenance procedure.

## Permissions

| Permission | Why it is needed |
| --- | --- |
| `activeTab` | Lets the user invoke SignBridge on the Meet tab and lets the extension start tab capture for that tab. It is temporary and granted by the toolbar click. |
| `scripting` | Runs one small function in the active page only when the user presses **Insert into page**. |
| `storage` | Keeps the composed message in `chrome.storage.session` (memory only) while the popup is reopened. |
| `tabCapture` | Captures **audio from the tab the user selected**. It is the only way to receive remote meeting audio without using the microphone. |
| `offscreen` | Gives the extension a hidden document with `AudioContext`, `AudioWorklet` and `WebSocket`, because a service worker has no DOM. |

- `host_permissions`: `http://127.0.0.1:8000/*` only. There is no `<all_urls>`, no `meet.google.com` host permission,
  no content script, no camera or microphone permission and no `tabs` permission.
- The background service worker orchestrates only; it never handles audio or transcript text.
- The captions window is a separate extension window. It is not an injected overlay.

## Privacy and consent

- Capture starts only from an explicit user action, after an explicit consent checkbox.
- A persistent **Captions on** banner names the captured tab and states that audio is sent to Gemini through the local
  backend. Chrome's own tab-capture indicator is also visible.
- **Stop captions** terminates the tab track, the AudioContext/worklet and the WebSocket. Closing the captions window
  does the same through the service worker's `windows.onRemoved` handler.
- The extension never captures the microphone as a fallback.
- The backend does not log audio or transcript text. The extension does not log either.
- Tell meeting participants that captions/transcription are active. Capturing other people's speech has privacy and
  consent implications beyond the local user.

## Install and run

1. Start the backend (see the table above) and make sure the pinned origin is in `SIGNBRIDGE_CORS_ORIGINS`.

2. Install and build:

   ```
   npm ci
   npm run build
   ```

3. Load `dist/` unpacked:
   - Open `chrome://extensions` (or `edge://extensions`) and turn on **Developer mode**.
   - Click **Load unpacked** and choose the `dist` folder.
   - Confirm the extension ID is `hfccobalkbgnibbjlmjmpjkffleccace`. If it differs, the `key` is missing and the
     backend allow-list will not match.

4. For meeting captions: open the Meet tab, click the SignBridge toolbar icon, tick consent and press **Start meeting
   captions**. Use **Stop captions** in the captions window when finished.

5. For signing: open the popup's **Live** tab and press **Start recognition**. Google Meet's camera must be **off**
   while SignBridge uses the camera; this is the current camera policy.

Rebuild with `npm run build` after changing source files, then click **Reload** on the extension card.

## If meeting captions do not start

The popup now reports the failing stage instead of a generic message:

| Message starts with | What to do |
| --- | --- |
| “SignBridge's background worker is not running” | Open `chrome://extensions`, click **Reload** on SignBridge, reopen the popup. Check the extension card for service-worker errors. |
| “The background worker did not answer / returned no answer” | Reload the extension and retry. The popup retries once automatically. |
| “SignBridge was reloaded while this popup was open” | Reopen the popup. |
| “Chrome did not allow audio capture” | Click the SignBridge toolbar icon while the Meet tab is active, then try again. |
| “Chrome could not open the captions window” | Close extra browser windows and retry. |
| “The caption audio process …” | Reload the extension and retry. |
| “The SignBridge backend is not running” / “no Gemini key” | Start the backend / add `GEMINI_API_KEY`. |

Technical details for the failing API call appear after “Details:”. The service worker also logs a single safe line:

```
[SignBridge startup] { stage, reason, detail }
```

It contains no audio, transcript, tab title or meeting URL. Failed starts close any partially created captions window and offscreen document, so pressing **Start** again works without restarting Chrome. If the React captions UI itself fails to load, the window stays open with a fallback message and a Close button.

## Tests

```
npm test
npm run build
```

The tests use mocks and jsdom. They do not need the backend, a webcam, a browser or Gemini. They cover:

- the manifest, pinned ID, permissions and absence of broad host access;
- the Day 2 backend client, recognition rules, preview and composer;
- meeting PCM resampling and framing;
- the transcription wire protocol;
- transport start/ready/stop, origin rejection, fatal errors and reconnect;
- caption state, the popup meeting panel and the captions window;
- the popup's start, stop, error and tab-navigation behaviour.

The manual Meet matrix is in `docs/MEETING_MODE_TEST_MATRIX.md`. It must be executed before claiming Google Meet
support.

## Repository layout

```
SignBridge-Extension/
  public/manifest.json        Manifest V3 configuration, pinned key
  popup.html                  Popup entry page
  captions.html               Separate captions window
  offscreen.html              Hidden capture/transcription page
  src/background.js           Service worker orchestration
  src/offscreen/              Tab audio capture, worklet entry
  src/captions/               Captions window (React)
  src/popup/                  Popup (React)
  src/lib/                    Backend client, recognition, meeting protocol/PCM/transport
  src/test/                   Test setup
  docs/                       Architecture, audit and Meet test matrix
  vite.config.js              Multi-entry build (popup, captions, offscreen, worker, worklet)
  package.json                Scripts and dependencies
```

Architecture details are in `docs/ARCHITECTURE.md`. The original audit is in `docs/EXTENSION_AUDIT.md`; meeting-mode
Phase 0 results and the audit are kept outside the repository.

## Limitations

- Single fingerspelled letters only (A, B, C, D, F, G, I, K, M, N, P, R, S, T, W, X). No words, sentences or
  continuous signing.
- The model is marked `unverified_dataset`; its reported accuracy is not signer-independent and is not real-world
  accuracy.
- **Meeting captions are experimental and untested with a real Google Meet call.** The local pipeline test used a local
  audio page, not Meet. Do not claim Google Meet compatibility before the manual matrix passes.
- Meeting captions currently capture **tab audio only**; they do not join the meeting, read chat, read captions from
  Meet, or inject text.
- Google Meet's camera must be **off** while SignBridge uses the camera. The backend camera and Chrome's camera cannot
  both produce usable frames on the tested machine.
- The backend and Gemini must be reachable while captions run. The backend caps a browser connection at 30 minutes and
  rotates its Gemini session; the extension also stops at 30 minutes.
- The transcript is not saved. Closing the captions window ends the session.
- The toolbar and extension-page icon is the SignBridge character in `public/icons/`, at 16, 32, 48 and 128 px.
