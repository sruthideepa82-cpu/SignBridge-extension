import { useCallback, useEffect, useId, useState } from 'react';
import { describeStartFailure } from '../lib/meeting/errors.js';
import { MSG, TARGET } from '../lib/meeting/messages.js';
import { sendMeetingMessage } from '../lib/meeting/startup.js';

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
      setTabError('Meeting captions need the installed SignBridge extension.');
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

  const looksLikeMeet = typeof tab?.url === 'string' && tab.url.startsWith('https://meet.google.com/');
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
      (message) => chromeApi.runtime.sendMessage(message),
      payload,
      { timeoutMs: 45000, stage: 'popup_start' },
    );

    // A just-suspended worker can miss the first wake-up. One immediate retry is safe because the background
    // treats an active/starting session as idempotent rather than creating a duplicate capture.
    if (['worker_unavailable', 'worker_closed', 'worker_no_response'].includes(response?.reason)) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      response = await sendMeetingMessage(
        (message) => chromeApi.runtime.sendMessage(message),
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
        (message) => chromeApi.runtime.sendMessage(message),
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

  return (
    <section className="card meeting" aria-labelledby="meeting-heading">
      <div className="card-head">
        <h2 id="meeting-heading">Meeting captions</h2>
        <p className="experimental-badge" role="note">Experimental</p>
      </div>

      <p className="meeting-intro">
        Live captions of the people speaking in a Google Meet tab. They are shown in a separate SignBridge window.
      </p>

      {active && (
        <div className="meeting-live" role="status">
          <span className="meeting-dot" aria-hidden="true" />
          <div>
            <strong>Captions are on</strong>
            <p>Audio from the selected tab is being sent to Gemini through your local backend. Nothing is recorded.</p>
          </div>
          <button type="button" className="secondary" onClick={stop} disabled={busy}>Stop</button>
        </div>
      )}

      <dl className="meeting-tab">
        <dt>Target tab</dt>
        <dd>{tabError || tab?.title || tab?.url || 'Reading the active tab…'}</dd>
      </dl>

      {!tabError && tab?.url && !looksLikeMeet && (
        <p className="meeting-warning" role="note">
          This tab is not Google Meet. Captions will capture audio from this tab instead. Open your Meet tab before
          starting if that is not what you want.
        </p>
      )}

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

      <div className="controls">
        <button type="button" onClick={start} disabled={!canStart}>
          {busy ? 'Starting…' : 'Start meeting captions'}
        </button>
      </div>

      <p className="meeting-status" role="status" aria-live="polite" data-tone={message?.tone ?? 'none'}>
        {message?.text ?? ''}
      </p>

      <p className="composer-note">
        The microphone is never used. Captions stop when you press Stop, close the captions window, or close the
        captured tab. This feature has not yet been verified with a real Google Meet call.
      </p>
    </section>
  );
}
