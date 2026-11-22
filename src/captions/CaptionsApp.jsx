import { useEffect, useRef, useState } from 'react';
import { BACKEND_ORIGIN } from '../lib/config.js';
import { isActivePhase } from '../lib/meeting/messages.js';
import { CloseIcon, HeadphonesIcon, MonitorIcon, StopIcon, TextSizeIcon, TrashIcon } from '../ui/icons.jsx';
import Waveform from '../ui/Waveform.jsx';
import { useCaptionsSession } from './useCaptionsSession.js';

const PHASE_LABEL = {
  idle: 'Ready',
  starting: 'Starting',
  listening: 'Listening',
  reconnecting: 'Reconnecting',
  stopping: 'Stopping',
  stopped: 'Stopped',
  error: 'Needs attention',
};

const TEXT_SIZES = [
  { id: 'normal', label: 'A', name: 'Normal text size' },
  { id: 'large', label: 'A+', name: 'Large text size' },
  { id: 'xlarge', label: 'A++', name: 'Extra large text size' },
];

function CaptureBanner({ snapshot }) {
  const { phase, error, tabTitle } = snapshot;
  if (phase === 'error') {
    return (
      <div className="capture-banner" data-state="error" role="alert">
        <span className="capture-dot" aria-hidden="true" />
        <div>
          <strong>Capture stopped</strong>
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
          <strong>Starting audio capture…</strong>
          <p>Connecting to the local SignBridge backend and the selected tab.</p>
        </div>
        <Waveform active label="Starting audio capture" />
      </div>
    );
  }
  if (isActivePhase(phase)) {
    return (
      <div className="capture-banner" data-state={phase === 'reconnecting' ? 'reconnecting' : 'on'} role="status">
        <span className="capture-dot" aria-hidden="true" />
        <div>
          <strong>{phase === 'reconnecting' ? 'Reconnecting…' : 'Audio capture active'}</strong>
          <p>
            {phase === 'reconnecting'
              ? 'The transcription connection was interrupted. Reconnecting; audio capture is still on.'
              : `Audio from ${tabTitle ? `“${tabTitle}”` : 'this tab'} is being sent to Gemini through your local backend. Nothing is recorded or saved.`}
          </p>
        </div>
        <Waveform active={phase !== 'stopping'} label="Audio capture active" />
      </div>
    );
  }
  return (
    <div className="capture-banner" data-state="off" role="status">
      <span className="capture-dot" aria-hidden="true" />
      <div>
        <strong>{phase === 'stopped' ? 'Captions stopped' : 'No active caption session'}</strong>
        <p>Open the SignBridge popup on the tab you want to caption and press Start browser captions.</p>
      </div>
    </div>
  );
}

export default function CaptionsApp({ chromeApi = globalThis.chrome }) {
  const { snapshot, stop, clear, closeWindow } = useCaptionsSession({ chromeApi });
  const [textSize, setTextSize] = useState('normal');
  const transcriptRef = useRef(null);
  const active = isActivePhase(snapshot.phase);
  const { finals, interim } = snapshot.captions;

  useEffect(() => {
    const node = transcriptRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [finals.length, interim]);

  return (
    <main className="captions" data-size={textSize}>
      <header className="captions-head">
        <div className="captions-brand">
          <span className="captions-logo" aria-hidden="true">SB</span>
          <div>
            <h1>Live captions</h1>
            <p>Browser audio · Experimental</p>
          </div>
        </div>
        <div className="captions-head-meta">
          <Waveform active={active} />
          <p className="captions-phase" data-phase={snapshot.phase}>
            <span className="phase-dot" aria-hidden="true" />
            {PHASE_LABEL[snapshot.phase] ?? 'Unknown'}
          </p>
        </div>
      </header>

      <CaptureBanner snapshot={snapshot} />

      <div className="source-strip captions-source">
        <span className="source-icon" aria-hidden="true"><MonitorIcon size={18} /></span>
        <div className="source-copy">
          <span>Source tab</span>
          <strong>{snapshot.tabTitle || snapshot.tabUrl || 'No active tab'}</strong>
        </div>
        <span className="source-state" data-active={active ? 'yes' : 'no'}>
          {active ? 'Capturing' : 'Idle'}
        </span>
      </div>

      <section
        className="captions-transcript"
        role="log"
        aria-live="polite"
        aria-label="Live captions"
        ref={transcriptRef}
      >
        {finals.length === 0 && !interim && (
          <div className="captions-empty">
            <span className="empty-orb" aria-hidden="true"><HeadphonesIcon size={24} /></span>
            <strong>{active ? 'Waiting for the first words…' : 'Ready when you are'}</strong>
            <p>{active ? 'Captions will appear here as people speak.' : 'Start browser captions from the SignBridge popup.'}</p>
          </div>
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
        <p>
          Local backend <code>{BACKEND_ORIGIN}</code> · Transcript kept in memory only · Platform compatibility not verified.
        </p>
        {snapshot.droppedFrames > 0 && (
          <p>{snapshot.droppedFrames} audio frame{snapshot.droppedFrames === 1 ? '' : 's'} dropped while reconnecting.</p>
        )}
      </footer>

      <div className="captions-controls">
        <button type="button" className="button danger stop" onClick={stop} disabled={!active && snapshot.phase !== 'starting'}>
          <StopIcon size={15} />
          Stop capture
        </button>
        <button type="button" className="button ghost" onClick={clear} disabled={finals.length === 0 && !interim}>
          <TrashIcon size={15} />
          Clear captions
        </button>
        <div className="text-size" role="group" aria-label="Caption text size">
          <TextSizeIcon size={15} />
          {TEXT_SIZES.map((size) => (
            <button
              key={size.id}
              type="button"
              aria-label={size.name}
              aria-pressed={textSize === size.id}
              onClick={() => setTextSize(size.id)}
            >
              {size.label}
            </button>
          ))}
        </div>
        <button type="button" className="button ghost icon-only close-window" onClick={closeWindow} aria-label="Close window">
          <CloseIcon size={16} />
        </button>
      </div>
    </main>
  );
}
