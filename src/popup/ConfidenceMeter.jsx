// A bar showing the model's confidence for the newest result, with a marker at the backend's threshold. The bar only
// shows a number the backend reported. It never implies that a letter is verified.
export default function ConfidenceMeter({ confidence, threshold }) {
  if (typeof confidence !== 'number') return null;
  const value = Math.round(Math.min(1, Math.max(0, confidence)) * 100);
  const marker = typeof threshold === 'number' ? Math.round(Math.min(1, Math.max(0, threshold)) * 100) : null;
  const above = marker === null || value >= marker;

  return (
    <div className="meter">
      <div
        className="meter-track"
        role="progressbar"
        aria-label="Recognition confidence"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
      >
        <div className="meter-fill" data-above={above ? 'yes' : 'no'} style={{ width: `${value}%` }} />
        {marker !== null && <div className="meter-marker" style={{ left: `${marker}%` }} />}
      </div>
      <div className="meter-labels" aria-hidden="true">
        <span>{value}%</span>
        {marker !== null && <span>Threshold {marker}%</span>}
      </div>
    </div>
  );
}
