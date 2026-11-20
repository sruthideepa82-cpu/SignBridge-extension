// The message card. Recognised letters are added here when they are stable. Everything else is an explicit user action.
export default function Composer({ composer }) {
  const { text, feedback, speaking } = composer;
  const empty = text.length === 0;

  return (
    <section className="card composer" aria-labelledby="composer-heading">
      <div className="card-head">
        <h2 id="composer-heading">Message</h2>
        <p className="composer-count">{Array.from(text).length} characters</p>
      </div>
      <textarea
        aria-labelledby="composer-heading"
        rows={3}
        value={text}
        placeholder="Stable letters are added here. You can also type or edit."
        onChange={(event) => composer.setText(event.target.value)}
      />
      <div className="controls">
        <button type="button" className="secondary" onClick={composer.addSpace}>Space</button>
        <button type="button" className="secondary" onClick={composer.backspace} disabled={empty}>Backspace</button>
        <button type="button" className="secondary" onClick={composer.clear} disabled={empty}>Clear</button>
      </div>
      <div className="controls">
        <button type="button" className="secondary" onClick={composer.copy} disabled={empty}>Copy</button>
        <button type="button" className="secondary" onClick={composer.speak} disabled={empty}>Speak</button>
        <button type="button" className="secondary" onClick={composer.stop} disabled={!speaking}>Stop speaking</button>
      </div>
      <button type="button" className="insert" onClick={composer.insert} disabled={empty}>
        Insert into page
      </button>
      <p className="composer-status" role="status" aria-live="polite" data-tone={feedback?.tone ?? 'none'}>
        {feedback?.message ?? ''}
      </p>
      <p className="composer-note">
        Insert changes only the field you clicked on the website. It never sends or submits anything.
      </p>
    </section>
  );
}
