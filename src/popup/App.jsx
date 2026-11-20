import { BACKEND_ORIGIN } from '../lib/config.js';
import { EXPERIMENTAL_LABEL, NOT_A_TRANSLATION, interpretRecognition } from '../lib/recognition.js';
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

  return (
    <main className="popup">
      <header className="brand">
        <div className="logo" aria-hidden="true">SB</div>
        <div>
          <h1>SignBridge</h1>
          <p className="tagline">Accessibility first. Communication for everyone.</p>
        </div>
      </header>

      <p className="experimental-badge" role="note">{EXPERIMENTAL_LABEL}</p>

      <section className="card" aria-labelledby="status-heading">
        <h2 id="status-heading">Recognition</h2>
        <p className="status" data-state={offline ? 'offline' : cameraRunning ? 'on' : 'off'}>
          <span className="status-dot" aria-hidden="true" />
          {statusLabel(connection, cameraRunning)}
        </p>
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

      <section className="card" aria-labelledby="letter-heading">
        <h2 id="letter-heading">Recognised letter</h2>
        <div className="letter" aria-hidden="true">
          {shown.kind === 'letter' ? shown.letter : '–'}
        </div>
        <div aria-live="polite">
          <p className="headline">{shown.headline}</p>
          <p className="detail">{shown.detail}</p>
        </div>
      </section>

      <footer className="footer">
        <p>{NOT_A_TRANSLATION}</p>
        <p>
          The webcam runs on this computer through the local backend at{' '}
          <code>{BACKEND_ORIGIN}</code>. Stop recognition when you finish; closing this popup does not stop the camera.
        </p>
      </footer>
    </main>
  );
}
