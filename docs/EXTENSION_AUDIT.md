# SignBridge extension: audit, duplicate verification and 3-day plan

Status of this document: written as the pre-build audit in the development copy of SignBridge. It is kept here as
reference. Paths such as `extension/` refer to that development copy. The extension now lives in its own repository.
Current architecture: see `ARCHITECTURE.md`. Port: the backend runs on 8000 (see Section 3 notes and `README.md`).

> Phase 1 update (22 November 2026): meeting captions now add `tabCapture`, `offscreen` and a background service
> worker. This audit's permission and scope sections describe the original Day 1–2 state only. See `README.md`,
> `ARCHITECTURE.md` and `MEETING_MODE_TEST_MATRIX.md` for the current design.

## 1. Original project status (verified)

- Location: `D:\Ctrl+ME\PROJECTS\SignBridge`
- Branch `main`, HEAD `5e36a1f`, identical to `origin/main` (pushed earlier today).
- Working tree clean. No stashes. No other branches.
- Protected files, model files and file fingerprints were re-checked after duplication. None changed.

## 2. Duplicate project

- Location: `D:\Ctrl+ME\PROJECTS\SignBridge-Extension-Development`
- Created with `git clone` from the original. Full committed history is kept. The tree hash matches the original
  (`9a7f284c6c067e1f12f0c103038e80f68380164d`).
- Git remote: the clone's remote was renamed to `source-project` (the local original). **No GitHub remote is configured**,
  so an accidental `git push` from the duplicate cannot reach the public repository. Add your own remote when you want one.

### What was copied as ignored runtime assets (56 files, 139 MB)

- `ai-engine/models/static_classifier.joblib` (alphabet model, 127 MB) and `phrase_classifier.joblib`
- model cards, training reports and validation output for those models
- `ai-engine/models/phrase_candidates/` (Stage 1 to 3 experiment artifacts, not active)
- `ai-engine/dataset/metadata/phrase_vocabulary.json`
- `ai-engine/dataset/public/isl_phrases/`: `landmarks.npz`, the inventories, the Stage 0 manifest folder (`v2/`) and the training reports

Copies were verified byte for byte against the originals.

### Deliberately not copied

- `backend/.env` (may contain secrets). Create your own from `backend/.env.example`.
- Virtual environments (`backend/.venv`, `signbridge_training/.venv`, `sign-to-voice/server/.venv`).
- `node_modules` (reinstall with `npm ci`).
- Image datasets: `Dataset for everyday phrases and words…` (325 MB), `Static gestures of ISL…` (6.3 GB),
  `ai-engine/dataset/public/isl_phrases/images/` and `ai-engine/dataset/public` (549 MB). Not needed to run the app.
- `ai-engine/models/archive/` (127 MB, an older model not used at runtime).
- Caches and build output.

## 3. Duplicate verification

| Check | Result |
| --- | --- |
| Git tree equals original | identical (`9a7f284c…`) |
| Backend imports its own code | `app.main` resolves to the duplicate's `backend/app/main.py` |
| Backend tests | 281 passed, 3 skipped (same as the original) |
| ai-engine tests | 193 passed, 7 skipped. Every skip is explained: the image folders and a few hardware or model checks are not in the copy |
| Frontend tests | 807 passed, 1 failed. The failure is the known Quick Phrases timeout (`AppPages.test.jsx`), which passes when run alone |
| Frontend production build | succeeds (`vite build`, warnings only about chunk size) |
| Backend runtime | starts on a separate port (8001). `/api/health`, `/api/camera/status`, `/api/recognition/latest` and `/api/recognition/phrase/model` return 200. The camera was not started |

Notes:
- The backend and ai-engine tests were run with the original project's Python environment, because the duplicate has no
  environment of its own yet. Create `backend/.venv` in the duplicate before relying on it independently.
- Frontend dependencies were installed in the duplicate with `npm ci` (126 packages).

## 4. Existing AI pipeline (verified by reading the code and running the models)

### Camera and landmarks

- The **backend** opens the webcam with OpenCV (`backend/app/services/camera_service.py`). The browser never opens the camera
  for recognition.
- MediaPipe Hand Landmarker runs in the backend, in VIDEO mode (`hand_detection_service.py`).
- Control endpoints: `POST /api/camera/start`, `POST /api/camera/stop`, `GET /api/camera/status`,
  `GET /api/camera/stream` (annotated MJPEG), `GET /api/camera/landmarks` (hand points per frame).
- The frontend polls `GET /api/recognition/latest` every 100 ms (`frontend/src/hooks/useRecognition.js`).

### Classifier

- Alphabet model: scikit-learn **random forest**, 63 features from `normalize_hand()`, **one hand per prediction**.
  The bundle is `ai-engine/models/static_classifier.joblib`.
- **Classes (16 letters):** A, B, C, D, F, G, I, K, M, N, P, R, S, T, W, X.
- Verification status from the bundle and the model card: `unverified_dataset`, `experimental: True`,
  `signer_independent: false`. The card records a test accuracy of 0.9169 (macro-F1 0.9194). That number comes from a
  public dataset split that is not signer-independent. **It must not be presented as real-world accuracy.**
- The response carries `experimental: true` and `verification: unverified_dataset`. The frontend labels these results
  "Experimental - Unverified Dataset".
- Two-hand rule: a letter is returned only when the hands agree. Different letters give an uncertain result.
- Threshold: 0.7 (configurable). Below it, the result is UNKNOWN and is not added to the draft.

### Other models

- **Daily phrases:** a single-frame phrase classifier (11 classes, 131 features), `unverified_dataset`, experimental.
  Live confidences observed earlier were 0.28 to 0.66, below the threshold, so it rarely produces a suggestion.
- **Sign sentence (word-level, temporal):** the model folder `signbridge_training/model/` **does not exist**. Its endpoint
  reports "no model". Word-level and continuous recognition are not available.
- **Vocabulary:** `ai-engine/dataset/metadata/vocabulary.json` has **zero verified classes**. The project has no verified model.

### Frontend reuse (pure logic, no backend dependency)

| Module | What it does | Reuse for the extension |
| --- | --- | --- |
| `frontend/src/lib/sentenceEditor.js` | editable sentence reducer (type, space, undo, delete, insert) | yes: the editable draft |
| `frontend/src/lib/speech.js`, `speechPreferences.js` | Web Speech API wrapper and voice preferences | yes: text-to-speech |
| `frontend/src/lib/recognitionStatus.js` | honest status text, experimental label | yes: never overstate results |
| `frontend/src/lib/letterSettings.js` | stable-frame and threshold settings | yes: hold-steady rule |
| `frontend/src/hooks/useSignBuffer.js` | holds a letter until stable, adds it once | adapt (it is a React hook, so the logic should be copied) |
| `frontend/src/services/cameraService.js`, `recognitionService.js`, `apiClient.js` | HTTP calls to the backend | adapt the base URL for the extension |

## 5. Blockers and limitations (critical)

1. **No verified model.** The only recognition model is experimental and unverified. The honest claim is "experimental
   fingerspelling-letter recognition", not ISL translation.
2. **Letters only.** The alphabet model recognises 16 fingerspelled letters. It does not recognise ISL words, sentences or
   continuous signing. The phrase model is single-frame and rarely confident. The word-level model is missing.
3. **The backend must run locally.** Recognition needs the FastAPI server and a webcam on the same computer. The extension
   is a client of that local server. It cannot recognise on its own.
4. **Access from the extension to the backend (CORS).** The backend allows only `localhost:5173`. Two options, and I recommend
   the second:
   - add the extension origin to `SIGNBRIDGE_CORS_ORIGINS` (environment, no code change). This needs the extension ID, which
     is fixed once the extension is loaded with a key;
   - declare `http://127.0.0.1:8000/*` in the extension's `host_permissions`. Extension pages with host permissions are not
     subject to the page's CORS rules. This keeps the backend untouched.
5. **Shared webcam.** The backend holds the webcam while it runs. The extension must not open the camera itself. If Live Studio
   is open in another tab, both use the same backend camera, which is fine, but Windows still allows only one owner of the device.
6. **Protected files.** The extension must not change `camera_service.py`, `hand_detection_service.py`, the recognition
   endpoints or the feature contract. The plan below needs none of them changed.
7. **Demonstration depends on hardware.** A working webcam, Python and Node on the machine, and good lighting. There is no
   fallback recognition, and none should be faked.
8. **Known test failure:** the Quick Phrases timeout in `AppPages.test.jsx`. It is timing-sensitive and passes alone.

## 6. Recommended MVP architecture

```
Chrome (Manifest V3)
 ├─ Popup (React): start/stop camera, live letter, editable draft, speak, copy, settings
 │    └─ uses lib/sentenceEditor.js, lib/speech.js, lib/recognitionStatus.js (copied)
 ├─ Service worker: polls the backend every 100 ms while the popup is open (or on demand)
 ├─ Optional content script (Day 2 stretch): inserts text into the focused field ONLY when the user clicks Insert
 └─ Floating widget (Day 3 stretch, Shadow DOM): a small button that opens the popup
                │ HTTP (host permission for 127.0.0.1:8000)
                ▼
Local backend (existing, unchanged): FastAPI + OpenCV camera + MediaPipe + RandomForest (16 letters)
```

Permissions: `storage` (settings only), `activeTab` (only for the explicit Insert action), and `host_permissions` for
`http://127.0.0.1:8000/*`. No camera permission, because the camera belongs to the backend. No `tabs` scanning, no
`webRequest`, no content scripts on every page.

Output rules:
- A letter is added to the draft only after it stays stable for the configured number of frames, and only when the
  backend status is `recognized`.
- Every recognised letter shows the experimental label. Uncertain or no-hand results never appear as text.
- The user confirms, edits, speaks, copies or inserts. Nothing is sent to any service automatically.

## 7. Three-day plan

### Day 1 (approval needed first)
- Extension skeleton (`extension/` folder in the duplicate): `manifest.json` (MV3), popup, service worker, build with the
  existing Vite toolchain.
- Backend connection: health check, camera start/stop, status display with honest error messages.
- Recognition display: poll `/api/recognition/latest`, show the current letter with its confidence and the experimental label.
- Tests: manifest validation, the API client (mocked fetch), and the stable-letter rule.
- Exit criterion: start the backend, load the extension unpacked, start the camera from the popup, see a status update.

### Day 2
- Universal composer in the popup: editable draft (reuse `sentenceEditor.js`), undo, space, delete, clear.
- Hold-steady letter confirmation (copy the logic from `useSignBuffer.js` and `letterSettings.js`), with the threshold shown.
- Text-to-speech (reuse `speech.js`) and copy-to-clipboard, each with a visible result or error.
- Explicit Insert into the focused field via a content script, only on click. Test it on a plain test page, not third-party sites.
- Tests for the composer, speech fallback and error states.
- Exit criterion: sign letters to a draft, edit it, speak it, copy it, and insert it into a test page.

### Day 3: stabilise and present (no new features)
- Fix critical bugs found on Day 2. Re-run all test suites and record the results.
- Write the README (install, run, demo), the architecture diagram, the folder structure, the testing report and the limitations.
- Rehearse the demo twice. Keep screenshots from a real run as the evidence. Do not rely on any fabricated output.
- Exit criterion: the demo runs end to end from a clean start, and the documentation matches what was tested.

Cut order if time runs short: floating widget first, then Insert into fields, then speech preferences. Keep the popup, the
draft, the hold-steady confirmation, the experimental labels and copy.

## 8. Exact approval needed next

1. Approve the **architecture in section 6**, in particular the choice of `host_permissions` over changing the backend's
   CORS setting.
2. Approve **Day 1** as the first extension work, inside the duplicate folder only. The original stays untouched.
3. Confirm that the demonstration will use a **live webcam on this computer** with the local backend. There is no offline mode.
4. Confirm that the report will describe recognition as **experimental fingerspelling-letter recognition**, with no ISL
   translation claim.
