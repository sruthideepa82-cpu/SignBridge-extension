# Live Communication — browser audio caption test matrix

**Status:** prepared and partially executed. **No meeting-platform compatibility is claimed.** Rows marked **Not run**
need a real call on that platform and must be completed before any compatibility claim. Google Meet is the first
platform targeted; Zoom and Microsoft Teams have not been tested at all.

Environment used for the local run: Windows 11 Home Single Language 10.0.26200 (x64), Google Chrome
157.0.8103.79, local backend on `127.0.0.1:8000`, pinned extension ID
`hfccobalkbgnibbjlmjmpjkffleccace`, local audio page on `127.0.0.1:9099` (SAPI speech, 13.48 s, looped).

The local run validates the extension pipeline and the backend/Gemini connection. It does **not** validate Google
Meet's audio path, Meet UI, meeting audio layout or real participant speech.

## A. Local pipeline verification (executed)

| # | Scenario | Steps | Expected | Result |
| --- | --- | --- | --- | --- |
| L1 | Production build | `npm ci`; `npm test`; `npm run build` | All tests pass; `dist` contains manifest, popup, captions, offscreen, background and worklet | **PASS** — 198 tests, build succeeded |
| L2 | Pinned ID and Origin | Load `dist`; check ID; restart backend with pinned origin; open WS with that Origin | ID is `hfccobalkbgnibbjlmjmpjkffleccace`; WS connects; a different origin still gets 403 | **PASS** |
| L3 | Local tab audio → Gemini | Load extension; open local audio page; invoke popup; consent; Start | Captions window shows “Listening”; interim/final text appears; no error | **PASS** — interim “The quick brown fox” observed; no final before stop |
| L4 | Playback preservation | During L3, inspect the source page | Audio keeps playing; `currentTime` advances | **PASS** |
| L5 | Stop | Press **Stop captions** | Phase “Stopped”; offscreen document gone; tab still playing; WS closed | **PASS** — 0 offscreen targets; audio still playing |
| L6 | Repeated session | Start again after L5 | A new session starts cleanly; previous state not reused | **PASS** — second session reached “Starting”, then stopped |
| L7 | Captions window close | Start; close the captions window | Capture stops; offscreen document closes; tab audio returns to normal | **PASS** — 0 offscreen targets; audio still playing |
| L8 | Privacy banner | Inspect captions window during capture | Persistent “Captions on” banner names the tab and says audio goes to Gemini; Stop is visible | **PASS** |
| L9 | No persistence (by inspection) | Inspect extension storage/network behaviour | No transcript in `chrome.storage`, `localStorage`, IndexedDB or logs; no audio uploaded except the WS stream | **PASS by code inspection** — no storage calls in meeting code |
| L10 | Microphone isolation | Capture a tab while its mic is unused | Only tab audio is captured; no `getUserMedia({audio:true})` without `chromeMediaSource:'tab'` | **PASS by code inspection and Phase 0 tests** |
| L11 | Startup failure categories | Inject failures in `windows.create`, `getMediaStreamId` and `offscreen.createDocument`; also load the build with no background worker | Each case returns a named category and technical detail, not the old generic message | **PASS** — window/stream/offscreen/worker categories verified |
| L12 | Startup cleanup and retry | Fail `windows.create` on the first attempt, then retry; inspect targets | No orphan captions window or offscreen document; second attempt succeeds | **PASS** — unit test and browser injection |
| L13 | Captions UI fallback | Force a render error in the captions window | Window remains visible with a fallback message and Close button | **PASS** — ErrorBoundary unit test; static loading text in `captions.html` |

Local limitations: the SAPI source is not Meet's WebRTC playback; Gemini received a short looped phrase; no final
utterance boundary was observed before stop.

## B. Meeting-platform matrix (not run — requires a real call)

Run each row with Chrome 157+ on the same laptop, a second participant, headphones first, and the backend running.
Record the date, Chrome version, Meet UI state, host load and result.

| # | Scenario | Steps | Expected | Result |
| --- | --- | --- | --- | --- |
| M1 | Real remote speech | Join a Meet call; second participant speaks; start captions | Remote speech appears as interim then final captions within the agreed latency target | **Not run** |
| M2 | Silence | Stay silent for 30 s after starting | No invented captions; empty/quiet state | **Not run** |
| M3 | Background noise | Fan/keyboard noise without speech | No persistent false captions; dropped frames stay low | **Not run** |
| M4 | Tab muted | Mute the Meet tab while captions run | The indicator stays visible; capture behaviour is recorded (Phase 0 says tab mute does not silence capture) | **Not run** |
| M5 | Inactive tab | Switch to another tab for 60 s | Capture and captions continue; no reconnect storm | **Not run** |
| M6 | Start/stop ×3 | Start and stop three times, including during speech | Each stop closes tracks/WS/offscreen; each start reconnects | **Not run** |
| M7 | Backend disconnect | Stop the backend during a call; restart it | UI shows reconnecting/error; no silent stale captions; recovery or clear failure | **Not run** |
| M8 | Network drop | Disable Wi-Fi briefly (Gemini/backend path) | Reconnect backoff works; dropped frames counted; captions resume or fail clearly | **Not run** |
| M9 | Playback | Use headphones and speakers | Meeting audio stays audible during capture | **Not run** |
| M10 | Latency/stability | Read a known paragraph; compare speech to captions | Interim appears quickly; finals are stable; no duplicated sentences | **Not run** |
| M11 | Privacy/stop | Press Stop during speech; close the window; close the tab | Capture indicator clears; stream dies immediately; nothing continues in the background | **Partially covered locally (L5/L7); Meet-specific not run** |
| M12 | Camera policy | Meet camera on, then start SignBridge recognition | SignBridge reports a clear camera conflict; no second camera session | **Not run in Meet** — Phase 0 proxy measured the conflict |
| M13 | Fullscreen | Enter Meet fullscreen with the captions window open | Captions window remains usable; no overlay claim | **Not run** |
| M14 | Audio device switch | Change Meet's output device during capture | Capture continues or fails visibly; no silent loss | **Not run** |
| M15 | Long call | 15 minutes without stopping | No fatal rotation gap; memory/CPU stable; 30-minute cap documented | **Not run** |
| M16 | Meet in PWA/app window | Open Meet as an installed app | Either capture works or a clear unsupported message is shown | **Not run** |
| M17 | Multiple Meet tabs | Two Meet tabs open; invoke on one | Only the invoked tab is captured | **Not run** |
| M18 | Meeting chat insertion | Focus Meet chat and press Insert into page | **Out of scope for Phase 1**; no claim | **N/A** |
| M19 | Zoom tab audio | Join a Zoom web meeting in a browser tab; second participant speaks | Same expectations as M1–M11 | **Not run** |
| M20 | Microsoft Teams tab audio | Join a Teams web meeting in a browser tab; second participant speaks | Same expectations as M1–M11 | **Not run** |

## C. Pass criteria for a compatibility claim

All of the following must hold:

1. M1 passes with remote participant speech from a second account.
2. M4/M5 pass with no capture loss or duplicate text.
3. M6/M7/M8 pass with clean teardown and a clear recovery/error state.
4. M9 passes: the user continues to hear the meeting.
5. M11 passes: Stop and window close terminate capture and the WebSocket.
6. M15 passes for 15 minutes with stable CPU/memory.
7. The pinned origin remains in the backend allow-list and no wildcard is present.
8. The README and UI wording are updated only after these results are recorded.

Until then, all documentation and UI must say **experimental, not verified with any meeting platform**.

## D. Defect log

| Date | Row | Observed | Severity | Follow-up |
| --- | --- | --- | --- | --- |
| — | — | — | — | — |
