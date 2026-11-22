// Decorative audio-capture waveform. It is CSS-only and respects prefers-reduced-motion through tokens.css.
export default function Waveform({ active = true, label = null, className = '' }) {
  return (
    <span
      className={`waveform ${className}`.trim()}
      data-active={active ? 'yes' : 'no'}
      role={label ? 'img' : undefined}
      aria-label={label ?? undefined}
      aria-hidden={label ? undefined : 'true'}
    >
      {[0, 1, 2, 3, 4].map((index) => <span key={index} />)}
    </span>
  );
}
