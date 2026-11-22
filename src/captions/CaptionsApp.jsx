import { useEffect, useRef, useState } from 'react';
import { BACKEND_ORIGIN } from '../lib/config.js';
import { isActivePhase } from '../lib/meeting/messages.js';
import { useCaptionsSession } from './useCaptionsSession.js';

const PHASE_LABEL = {
  idle: 'Idle',
  starting: 'Starting',
  listening: 'Listening',
  reconnecting: 'Reconnecting',
  stopping: 'Stopping',
  stopped: 'Stopped',
  error: 'Stopped with an error',
};

function CaptureBanner({ snapshot }) {
  const { phase, error, tabTitle } = snapshot;
  if (phase === 'error') {
    return (
      <div className="capture-banner" data-state="error" role="alert">
        <span className="capture-dot" aria-hidden="true" />
        <div>
          <strong>Captions are off</strong>
          <p>{error?.message || 'The caption session stopped because of an error.'}</p>
        </div>
      </div>
    );
  }
  if (phase === 'starting') {
    return (
      <div className="capture-banner" data-state="starting" role="status">
        <span className="capture-dot" aria-hidden="true" />
        <div>
          <strong>Starting captions</strong>
          <p>Connecting to the local SignBridge backend and the selected tab.</p>
        </div>
      </div>
    );
  }
  if (isActivePhase(phase)) {
    return (
      <div className="capture-banner" data-state="on" role="status">
        <span className="capture-dot" aria-hidden="true" />
        <div>
          <strong>Captions on</strong>
          <p>
            {phase === 'reconnecting'
              ? 'The connection was interrupted. Reconnecting… Audio capture is still on.'
              : `Audio from ${tabTitle ? `“${tabTitle}”` : 'the selected tab'} is being sent to Gemini through your local backend. Nothing is recorded or saved.`}
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="capture-banner" data-state="off" role="status">
      <span className="capture-dot" aria-hidden="true" />
      <div>
        <strong>{phase === 'stopped' ? 'Captions stopped' : 'No caption session'}</strong>
        <p>Open the SignBridge toolbar popup on your Meet tab and press Start meeting captions.</p>
      </div>
    </div>
  );
}

export default function CaptionsApp({ chromeApi = globalThis.chrome }) {
  const { snapshot, stop, clear, closeWindow } = useCaptionsSession({ chromeApi });
  const [large, setLarge] = useState(false);
  const transcriptRef = useRef(null);
  const active = isActivePhase(snapshot.phase);
  const { finals, interim } = snapshot.captions;

  useEffect(() => {
    const node = transcriptRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [finals.length, interim]);

  return (
    <main className="captions" data-large={large ? 'yes' : 'no'}>
      <header className="captions-head">
        <div className="captions-brand">
          <span className="captions-logo" aria-hidden="true">SB</span>
          <div>
            <h1>Meeting captions</h1>
            <p>Experimental · Not verified with Google Meet</p>
          </div>
        </div>
        <p className="captions-phase" data-phase={snapshot.phase}>
          <span className="phase-dot" aria-hidden="true" />
          {PHASE_LABEL[snapshot.phase] ?? 'Unknown'}
        </p>
      </header>

      <CaptureBanner snapshot={snapshot} />

      <section
        className="captions-transcript"
        role="log"
        aria-live="polite"
        aria-label="Live captions"
        ref={transcriptRef}
      >
        {finals.length === 0 && !interim && (
          <p className="captions-empty">
            {active ? 'Waiting for someone to speak…' : 'Captions will appear here.'}
          </p>
        )}
        {finals.map((entry) => (
          <p key={`${entry.seq}:${entry.at}`} className="caption-final">{entry.text}</p>
        ))}
        {interim && <p className="caption-interim">{interim}</p>}
      </section>

      {snapshot.error && snapshot.phase !== 'error' && (
        <p className="captions-error" role="alert">{snapshot.error.message}</p>
      )}

      <footer className="captions-foot">
        <p className="captions-source">
          <span>Source</span> {snapshot.tabTitle || snapshot.tabUrl || 'No active tab'}
        </p>
        <p>
          Local backend <code>{BACKEND_ORIGIN}</code> · Transcript kept in memory only · Stop closes the tab stream
          and the transcription connection.
        </p>
        {snapshot.droppedFrames > 0 && (
          <p>{snapshot.droppedFrames} audio frame{snapshot.droppedFrames === 1 ? '' : 's'} dropped while reconnecting.</p>
        )}
      </footer>

      <div className="captions-controls">
        <button type="button" className="stop" onClick={stop} disabled={!active && snapshot.phase !== 'starting'}>
          Stop captions
        </button>
        <button type="button" className="secondary" onClick={clear} disabled={finals.length === 0 && !interim}>
          Clear text
        </button>
        <button type="button" className="secondary" onClick={() => setLarge((value) => !value)} aria-pressed={large}>
          {large ? 'Normal text' : 'Larger text'}
        </button>
        <button type="button" className="secondary" onClick={closeWindow}>
          Close window
        </button>
      </div>
    </main>
  );
}
