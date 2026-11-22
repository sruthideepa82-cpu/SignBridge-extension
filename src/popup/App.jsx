import { useRef, useState } from 'react';
import { BACKEND_ORIGIN } from '../lib/config.js';
import { EXPERIMENTAL_LABEL, NOT_A_TRANSLATION, interpretRecognition } from '../lib/recognition.js';
import { BroadcastIcon, CameraIcon, MessageIcon, PlayIcon, StopIcon } from '../ui/icons.jsx';
import CameraPreview from './CameraPreview.jsx';
import Composer from './Composer.jsx';
import ConfidenceMeter from './ConfidenceMeter.jsx';
import MeetPanel from './MeetPanel.jsx';
import { useComposer } from './useComposer.js';
import { useRecognition } from './useRecognition.js';

const TABS = [
  { id: 'live', label: 'Live', Icon: CameraIcon },
  { id: 'message', label: 'Message', Icon: MessageIcon },
  { id: 'communication', label: 'Live Communication', Icon: BroadcastIcon },
];

function statusLabel(connection, cameraRunning) {
  if (connection === 'checking') return 'Checking SignBridge';
  if (connection === 'offline') return 'SignBridge not reachable';
  return cameraRunning ? 'Camera on' : 'Camera off';
}

function backendLabel(connection) {
  if (connection === 'checking') return 'Checking';
  if (connection === 'offline') return 'Offline';
  return 'Local';
}

export default function App() {
  const { connection, cameraRunning, busy, error, result, start, stop } = useRecognition();
  const shown = result ?? interpretRecognition({ status: 'camera_off' });
  const offline = connection === 'offline';
  const composer = useComposer({
    observation: {
      letter: shown.kind === 'letter' ? shown.letter : null,
      sequence: result?.sequence ?? null,
    },
  });
  const [tab, setTab] = useState('live');
  const tabRefs = useRef({});

  // All panels stay mounted. Switching tabs only hides one, so recognition, the preview, the composer and caption
  // controls keep running and keep their state.
  const selectTab = (id) => {
    setTab(id);
    tabRefs.current[id]?.focus();
  };

  const onTabKeyDown = (event) => {
    const index = TABS.findIndex((item) => item.id === tab);
    const keys = {
      ArrowRight: (index + 1) % TABS.length,
      ArrowLeft: (index - 1 + TABS.length) % TABS.length,
      Home: 0,
      End: TABS.length - 1,
    };
    if (!(event.key in keys)) return;
    event.preventDefault();
    selectTab(TABS[keys[event.key]].id);
  };

  return (
    <main className="popup app-shell">
      <div className="ambient-layer" aria-hidden="true">
        <div className="ambient ambient-one" />
        <div className="ambient ambient-two" />
      </div>

      <header className="app-header">
        <div className="brand">
          <div className="logo" aria-hidden="true">
            <span>SB</span>
            <i className="logo-spark" />
          </div>
          <div className="brand-copy">
            <h1>SignBridge</h1>
            <p>Accessibility, connected.</p>
          </div>
        </div>
        <p className="backend-pill" data-state={offline ? 'offline' : connection === 'checking' ? 'checking' : 'online'}>
          <span className="status-dot" aria-hidden="true" />
          {backendLabel(connection)}
        </p>
      </header>

      <div className="tabs" role="tablist" aria-label="SignBridge sections" onKeyDown={onTabKeyDown}>
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            ref={(node) => { tabRefs.current[id] = node; }}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            className="tab"
            data-active={tab === id ? 'yes' : 'no'}
            onClick={() => selectTab(id)}
          >
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className="panel" role="tabpanel" id="panel-live" aria-labelledby="tab-live" hidden={tab !== 'live'}>
        <div className="panel-stack">
          <section className="card camera-card" aria-labelledby="camera-heading">
            <div className="card-head">
              <div>
                <p className="eyebrow">Live recognition</p>
                <h2 id="camera-heading">Camera</h2>
              </div>
              <p className="status" data-state={offline ? 'offline' : cameraRunning ? 'on' : 'off'}>
                <span className="status-dot" aria-hidden="true" />
                {statusLabel(connection, cameraRunning)}
              </p>
            </div>

            <div className="camera-stage">
              <CameraPreview active={cameraRunning} offline={offline} />
              {cameraRunning && !offline && (
                <span className="live-chip">
                  <span aria-hidden="true" />
                  Live
                </span>
              )}
            </div>

            <div className="control-row">
              <button type="button" className="button primary" onClick={start} disabled={busy || cameraRunning}>
                <PlayIcon size={16} />
                Start recognition
              </button>
              <button type="button" className="button ghost" onClick={stop} disabled={busy || !cameraRunning}>
                <StopIcon size={15} />
                Stop recognition
              </button>
            </div>

            {error && <p className="error inline-alert" role="alert">{error}</p>}
          </section>

          <section className="card result-card" aria-labelledby="letter-heading">
            <div className="result-head">
              <div>
                <p className="eyebrow">Recognition</p>
                <h2 id="letter-heading">Recognised letter</h2>
              </div>
              <p className="experimental-badge" role="note">{EXPERIMENTAL_LABEL}</p>
            </div>

            <div className="result-main">
              <div className="letter-frame" data-active={shown.kind === 'letter' ? 'yes' : 'no'}>
                <div className="letter" key={shown.kind === 'letter' ? shown.letter : 'empty'}>
                  {shown.kind === 'letter' ? shown.letter : '–'}
                </div>
              </div>
              <div className="result-copy" aria-live="polite">
                <p className="headline">{shown.headline}</p>
                <p className="detail">{shown.detail}</p>
              </div>
            </div>

            <ConfidenceMeter confidence={shown.confidence ?? null} threshold={shown.threshold ?? null} />

            <p className="recognition-hint">
              <span className="hint-spark" aria-hidden="true">✦</span>
              Hold one hand steady, palm toward the camera, in good light.
            </p>
          </section>

          <footer className="footer">
            <p>{NOT_A_TRANSLATION} The model recognises supported fingerspelled letters only.</p>
            <p>Local backend: <code>{BACKEND_ORIGIN}</code></p>
          </footer>
        </div>
      </div>

      <div className="panel" role="tabpanel" id="panel-message" aria-labelledby="tab-message" hidden={tab !== 'message'}>
        <Composer composer={composer} />
      </div>

      <div
        className="panel"
        role="tabpanel"
        id="panel-communication"
        aria-labelledby="tab-communication"
        hidden={tab !== 'communication'}
      >
        <MeetPanel />
      </div>
    </main>
  );
}
