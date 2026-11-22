import { useCallback, useEffect, useId, useState } from 'react';
import { describeStartFailure } from '../lib/meeting/errors.js';
import { MSG, TARGET } from '../lib/meeting/messages.js';
import { sendMeetingMessage } from '../lib/meeting/startup.js';
import {
  AlertIcon,
  BroadcastIcon,
  CheckIcon,
  LockIcon,
  MonitorIcon,
  ShieldIcon,
  StopIcon,
} from '../ui/icons.jsx';
import Waveform from '../ui/Waveform.jsx';

function hostFor(url) {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

// The popup only starts and stops a session. All audio, transcription and captions live in the offscreen document and
// the separate captions window, so closing the popup never affects a running session.
export default function MeetPanel({ chromeApi = globalThis.chrome }) {
  const [tab, setTab] = useState(null);
  const [tabError, setTabError] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [active, setActive] = useState(false);
  const consentId = useId();

  const send = useCallback((type, payload = {}) => {
    if (!chromeApi?.runtime?.sendMessage) return Promise.resolve(null);
    return chromeApi.runtime.sendMessage({ target: TARGET.BACKGROUND, type, ...payload }).catch(() => null);
  }, [chromeApi]);

  useEffect(() => {
    let cancelled = false;
    if (!chromeApi?.tabs?.query) {
      setTabError('Live Communication needs the installed SignBridge extension.');
      return undefined;
    }
    chromeApi.tabs.query({ active: true, currentWindow: true })
      .then(([current]) => { if (!cancelled) setTab(current ?? null); })
      .catch(() => { if (!cancelled) setTabError('The active tab could not be read. Reopen the popup and try again.'); });
    return () => { cancelled = true; };
  }, [chromeApi]);

  useEffect(() => {
    let cancelled = false;
    send(MSG.MEETING_STATUS).then((response) => {
      if (!cancelled && response?.ok) setActive(Boolean(response.active));
    });
    return () => { cancelled = true; };
  }, [send]);

  const canStart = Boolean(tab?.id) && consent && !busy && !active;

  const start = async () => {
    if (!canStart) return;
    setBusy(true);
    setMessage({ tone: 'info', text: 'Opening the captions window and checking the backend…' });
    const attemptId = globalThis.crypto?.randomUUID?.()
      ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const payload = {
      target: TARGET.BACKGROUND,
      type: MSG.MEETING_START,
      attemptId,
      tabId: tab.id,
      tabTitle: tab.title ?? '',
      tabUrl: tab.url ?? '',
    };
    let response = await sendMeetingMessage(
      (outbound) => chromeApi.runtime.sendMessage(outbound),
      payload,
      { timeoutMs: 45000, stage: 'popup_start' },
    );

    // A just-suspended worker can miss the first wake-up. One immediate retry is safe because the background
    // treats an active/starting session as idempotent rather than creating a duplicate capture.
    if (['worker_unavailable', 'worker_closed', 'worker_no_response'].includes(response?.reason)) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      response = await sendMeetingMessage(
        (outbound) => chromeApi.runtime.sendMessage(outbound),
        payload,
        { timeoutMs: 20000, stage: 'popup_start_retry' },
      );
    }

    setBusy(false);
    if (response?.ok) {
      setActive(true);
      setMessage({
        tone: 'success',
        text: response.alreadyRunning
          ? 'Captions are already running in the SignBridge captions window.'
          : 'Captions are starting in the SignBridge captions window.',
      });
      return;
    }

    let detail = response?.detail ?? '';
    if (['worker_unavailable', 'worker_closed', 'worker_timeout', 'worker_no_response', 'worker_error'].includes(response?.reason)) {
      const diagnostics = await sendMeetingMessage(
        (outbound) => chromeApi.runtime.sendMessage(outbound),
        { target: TARGET.BACKGROUND, type: MSG.MEETING_DIAGNOSTICS },
        { timeoutMs: 2500, stage: 'popup_diagnostics' },
      );
      if (diagnostics?.lastStartup) {
        const stage = diagnostics.lastStartup.stage ?? 'unknown';
        const reason = diagnostics.lastStartup.reason ?? 'unknown';
        detail = `${detail} Last background stage: ${stage} (${reason}).`.trim();
      }
    }

    if (response?.reason === 'worker_timeout') {
      // Best effort: do not let a late startup keep a hidden session alive.
      send(MSG.MEETING_STOP, { reason: 'start_timeout' });
    }
    setMessage({ tone: 'error', text: describeStartFailure({ ...response, detail }) });
  };

  const stop = async () => {
    setBusy(true);
    await send(MSG.MEETING_STOP, { reason: 'user' });
    setBusy(false);
    setActive(false);
    setMessage({ tone: 'info', text: 'Captions stopped. Audio capture and the transcription connection were closed.' });
  };

  const tabHost = hostFor(tab?.url);

  return (
    <section className="card communication" aria-labelledby="communication-heading">
      <div className="card-head communication-head">
        <div>
          <p className="eyebrow">Browser audio captions</p>
          <h2 id="communication-heading">Live Communication</h2>
        </div>
        <span className="experimental-badge" role="note">Experimental</span>
      </div>

      <p className="communication-intro">
        Turn audio from the current browser tab into live captions in a separate SignBridge window. Use it with any tab
        that plays audio; meeting-platform compatibility has not been verified.
      </p>

      {active && (
        <div className="capture-active" role="status">
          <span className="capture-orb" aria-hidden="true">
            <Waveform active label={undefined} />
          </span>
          <div className="capture-active-copy">
            <strong>Capturing audio from this tab</strong>
            <p>Audio is sent to Gemini through your local backend. Nothing is recorded or saved.</p>
          </div>
          <button type="button" className="button danger small" onClick={stop} disabled={busy}>
            <StopIcon size={14} />
            Stop capture
          </button>
        </div>
      )}

      <div className="target-card">
        <span className="target-icon" aria-hidden="true"><MonitorIcon size={20} /></span>
        <div className="target-copy">
          <span className="target-label">Capturing from</span>
          <strong>{tabError || tab?.title || 'Reading the active tab…'}</strong>
          <span className="target-host">
            {tabError ? 'Open the installed extension on the tab you want to caption.' : (tabHost || tab?.url || 'Browser tab')}
          </span>
        </div>
        <span className="target-state" data-state={tabError ? 'off' : active ? 'on' : 'ready'}>
          {tabError ? 'Unavailable' : active ? 'Active' : 'Ready'}
        </span>
      </div>

      <div className="consent-card">
        <div className="consent-head">
          <span className="consent-icon" aria-hidden="true"><ShieldIcon size={18} /></span>
          <div>
            <strong>Permission to capture audio</strong>
            <p>Only audio from this tab is used. The microphone is never opened.</p>
          </div>
        </div>
        <label className="consent" htmlFor={consentId}>
          <input
            id={consentId}
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            disabled={active || busy}
          />
          <span>
            I understand that audio from this tab will be sent to Google Gemini through my local SignBridge backend.
            Nothing is recorded or saved by SignBridge.
          </span>
        </label>
      </div>

      <div className="control-row">
        <button type="button" className="button primary" onClick={start} disabled={!canStart}>
          <BroadcastIcon size={17} />
          {busy ? 'Starting…' : 'Start browser captions'}
        </button>
      </div>

      <p className="meeting-status communication-status" role="status" aria-live="polite" data-tone={message?.tone ?? 'none'}>
        {message?.tone === 'success' && <CheckIcon size={14} />}
        {message?.tone === 'error' && <AlertIcon size={14} />}
        <span>{message?.text ?? ''}</span>
      </p>

      <div className="communication-note">
        <LockIcon size={14} />
        <p>
          Captions stop when you press Stop capture, close the captions window, or close this tab. Google Meet, Zoom and
          Microsoft Teams are examples of tabs you might caption; compatibility has not been verified.
        </p>
      </div>
    </section>
  );
}
