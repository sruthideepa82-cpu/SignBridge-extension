import { BACKEND_ORIGIN } from '../lib/config.js';
import { EXPERIMENTAL_LABEL, NOT_A_TRANSLATION, interpretRecognition } from '../lib/recognition.js';
import CameraPreview from './CameraPreview.jsx';
import Composer from './Composer.jsx';
import ConfidenceMeter from './ConfidenceMeter.jsx';
import { useComposer } from './useComposer.js';
import { useRecognition } from './useRecognition.js';

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

  return (
    <main className="popup">
      <header className="brand">
        <div className="logo" aria-hidden="true">SB</div>
        <div>
          <h1>SignBridge</h1>
          <p className="tagline">Accessibility first. Communication for everyone.</p>
        </div>
      </header>

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
        <h2 id="letter-heading">Recognised letter</h2>
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
        <p className="experimental-badge" role="note">{EXPERIMENTAL_LABEL}</p>
      </section>

      <Composer composer={composer} />

      <footer className="footer">
        <p>{NOT_A_TRANSLATION}</p>
        <p>The current model recognises supported fingerspelled letters only, not words or sentences.</p>
        <p>
          Local backend: <code>{BACKEND_ORIGIN}</code>. Closing this popup does not stop the camera.
        </p>
      </footer>
    </main>
  );
}
