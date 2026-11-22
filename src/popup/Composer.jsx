import {
  BackspaceIcon,
  CheckIcon,
  CopyIcon,
  InsertIcon,
  SpaceIcon,
  SpeakerIcon,
  SpeakerOffIcon,
  TrashIcon,
} from '../ui/icons.jsx';

// The message card. Recognised letters are added here when they are stable. Everything else is an explicit user action.
export default function Composer({ composer }) {
  const { text, feedback, speaking } = composer;
  const empty = text.length === 0;
  const count = Array.from(text).length;

  return (
    <section className="card composer" aria-labelledby="composer-heading">
      <div className="card-head composer-head">
        <div>
          <p className="eyebrow">Compose</p>
          <h2 id="composer-heading">Message</h2>
        </div>
        <p className="composer-count" aria-live="polite">
          <strong>{count}</strong> {count === 1 ? 'character' : 'characters'}
        </p>
      </div>

      <div className="composer-field">
        <textarea
          aria-labelledby="composer-heading"
          rows={4}
          value={text}
          placeholder="Stable letters are added here. You can also type or edit."
          onChange={(event) => composer.setText(event.target.value)}
        />
        <span className="composer-field-glow" aria-hidden="true" />
      </div>

      <div className="composer-edit-row" aria-label="Edit message">
        <button type="button" className="chip" onClick={composer.addSpace}>
          <SpaceIcon size={15} />
          Space
        </button>
        <button type="button" className="chip" onClick={composer.backspace} disabled={empty}>
          <BackspaceIcon size={15} />
          Backspace
        </button>
        <button type="button" className="chip danger" onClick={composer.clear} disabled={empty}>
          <TrashIcon size={15} />
          Clear
        </button>
      </div>

      <div className="composer-actions">
        <button type="button" className="button soft" onClick={composer.copy} disabled={empty}>
          <CopyIcon size={16} />
          Copy
        </button>
        <button type="button" className="button soft" onClick={composer.speak} disabled={empty}>
          <SpeakerIcon size={16} />
          Speak
        </button>
        <button type="button" className="button soft" onClick={composer.stop} disabled={!speaking}>
          <SpeakerOffIcon size={16} />
          Stop speaking
        </button>
      </div>

      <button type="button" className="button primary insert" onClick={composer.insert} disabled={empty}>
        <InsertIcon size={17} />
        Insert into page
      </button>

      <p className="composer-status" role="status" aria-live="polite" data-tone={feedback?.tone ?? 'none'}>
        {feedback?.tone === 'success' && <CheckIcon size={14} />}
        <span>{feedback?.message ?? ''}</span>
      </p>

      <p className="composer-note">
        Insert changes only the field you clicked on the website. It never sends or submits anything.
      </p>
    </section>
  );
}
