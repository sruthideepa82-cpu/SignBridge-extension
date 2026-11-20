// Turns a /api/recognition/latest response into what the popup may say.
//
// Rules (from the backend contract):
// - A letter is shown only for status "recognized" with a single letter A to Z.
// - "uncertain", "no_hand", "two_hands", "camera_off" and "no_model" never show a letter.
// - Every letter carries the experimental label while the backend reports the model as unverified.

export const EXPERIMENTAL_LABEL = 'Experimental: unverified dataset';
export const NOT_A_TRANSLATION = 'Single fingerspelled letters only. Not a verified ISL translation.';

const LETTER = /^[A-Z]$/;

function percent(value) {
  return `${Math.round(value * 100)}%`;
}

export function interpretRecognition(response) {
  if (!response || typeof response !== 'object' || typeof response.status !== 'string') {
    return {
      kind: 'unexpected',
      headline: 'No recognition data',
      detail: 'The backend returned a response the popup does not understand.',
      letter: null,
      confidence: null,
      experimental: true,
    };
  }

  // A missing flag is treated as experimental, so an unlabelled result is never shown as verified.
  const experimental = response.experimental !== false;
  const threshold = typeof response.threshold === 'number' ? percent(response.threshold) : null;

  switch (response.status) {
    case 'recognized': {
      const label = typeof response.label === 'string' ? response.label.trim() : '';
      if (!LETTER.test(label)) {
        return {
          kind: 'unexpected',
          headline: 'No recognition data',
          detail: 'The backend reported a result the popup cannot display as a letter.',
          letter: null,
          confidence: null,
          experimental,
        };
      }
      const confidence = typeof response.confidence === 'number' ? response.confidence : null;
      return {
        kind: 'letter',
        headline: label,
        detail: confidence === null
          ? 'Recognised letter.'
          : `Confidence ${percent(confidence)}${threshold ? ` (above the ${threshold} threshold)` : ''}.`,
        letter: label,
        confidence,
        threshold: typeof response.threshold === 'number' ? response.threshold : null,
        experimental,
      };
    }
    case 'uncertain':
      return {
        kind: 'uncertain',
        headline: 'Not sure yet',
        detail: typeof response.confidence === 'number' && threshold
          ? `Confidence ${percent(response.confidence)} is below the ${threshold} threshold. Nothing is shown as a letter.`
          : 'The hand is visible, but no letter is clear enough. Nothing is shown as a letter.',
        letter: null,
        confidence: typeof response.confidence === 'number' ? response.confidence : null,
        threshold: typeof response.threshold === 'number' ? response.threshold : null,
        experimental,
      };
    case 'no_hand':
      return {
        kind: 'no_hand',
        headline: 'Show one hand',
        detail: 'Hold one hand in front of the camera, palm facing the lens.',
        letter: null,
        confidence: null,
        experimental,
      };
    case 'two_hands':
      return {
        kind: 'two_hands',
        headline: 'Two hands disagree',
        detail: response.detail || 'The two hands show different letters. Hold up the signing hand alone.',
        letter: null,
        confidence: null,
        experimental,
      };
    case 'camera_off':
      return {
        kind: 'camera_off',
        headline: 'Camera is off',
        detail: 'Press Start recognition to turn the camera on.',
        letter: null,
        confidence: null,
        experimental,
      };
    case 'no_model':
      return {
        kind: 'no_model',
        headline: 'Model not available',
        detail: response.detail || 'The recognition model could not be loaded on the backend.',
        letter: null,
        confidence: null,
        experimental,
      };
    default:
      return {
        kind: 'unexpected',
        headline: 'Unknown status',
        detail: `The backend reported an unknown status: ${response.status}.`,
        letter: null,
        confidence: null,
        experimental,
      };
  }
}
