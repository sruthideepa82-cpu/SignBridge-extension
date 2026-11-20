import { useRef, useState } from 'react';
import { BACKEND_ORIGIN } from '../lib/config.js';
import { EXPERIMENTAL_LABEL, NOT_A_TRANSLATION, interpretRecognition } from '../lib/recognition.js';
import CameraPreview from './CameraPreview.jsx';
import Composer from './Composer.jsx';
import ConfidenceMeter from './ConfidenceMeter.jsx';
import { useComposer } from './useComposer.js';
import { useRecognition } from './useRecognition.js';

const TABS = [
  { id: 'live', label: 'Live' },
  { id: 'message', label: 'Message' },
];

function statusLabel(connection, cameraRunning) {
  if (connection === 'checking') return 'Checking SignBridge';
  if (connection === 'offline') return 'SignBridge not reachable';
  return cameraRunning ? 'Camera on' : 'Camera off';
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

  // Both panels stay mounted. Switching tabs only hides one, so the camera preview, recognition polling and the
  // composer keep running and keep their state.
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
    <main className="popup">
      <header className="brand">
        <div className="logo" aria-hidden="true">SB</div>
        <div>
          <h1>SignBridge</h1>
          <p className="tagline">Accessibility first. Communication for everyone.</p>
        </div>
      </header>

      <div className="tabs" role="tablist" aria-label="SignBridge sections" onKeyDown={onTabKeyDown}>
        {TABS.map((item) => (
          <button
            key={item.id}
            ref={(node) => { tabRefs.current[item.id] = node; }}
            type="button"
            role="tab"
            id={`tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls={`panel-${item.id}`}
            tabIndex={tab === item.id ? 0 : -1}
            className="tab"
            onClick={() => selectTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="panel" role="tabpanel" id="panel-live" aria-labelledby="tab-live" hidden={tab !== 'live'}>
        <section className="card" aria-labelledby="camera-heading">
          <div className="card-head">
            <h2 id="camera-heading">Live camera</h2>
            <p className="status" data-state={offline ? 'offline' : cameraRunning ? 'on' : 'off'}>
              <span className="status-dot" aria-hidden="true" />
              {statusLabel(connection, cameraRunning)}
            </p>
          </div>
          <CameraPreview active={cameraRunning} offline={offline} />
          <div className="controls">
            <button type="button" onClick={start} disabled={busy || cameraRunning}>
              Start recognition
            </button>
            <button type="button" className="secondary" onClick={stop} disabled={busy || !cameraRunning}>
              Stop recognition
            </button>
          </div>
          {error && (
            <p className="error" role="alert">{error}</p>
          )}
        </section>

        <section className="card result" aria-labelledby="letter-heading">
          <div className="card-head">
            <h2 id="letter-heading">Recognised letter</h2>
            <p className="experimental-badge" role="note">{EXPERIMENTAL_LABEL}</p>
          </div>
          <div className="result-body">
            <div className="letter" aria-hidden="true">
              {shown.kind === 'letter' ? shown.letter : '–'}
            </div>
            <div aria-live="polite">
              <p className="headline">{shown.headline}</p>
              <p className="detail">{shown.detail}</p>
            </div>
          </div>
          <ConfidenceMeter confidence={shown.confidence ?? null} threshold={shown.threshold ?? null} />
        </section>

        <footer className="footer">
          <p>{NOT_A_TRANSLATION} The current model recognises supported fingerspelled letters only.</p>
          <p>
            Local backend: <code>{BACKEND_ORIGIN}</code>. Closing this popup does not stop the camera.
          </p>
        </footer>
      </div>

      <div className="panel" role="tabpanel" id="panel-message" aria-labelledby="tab-message" hidden={tab !== 'message'}>
        <Composer composer={composer} />
      </div>
    </main>
  );
}
