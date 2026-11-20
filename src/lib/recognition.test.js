import { describe, expect, it } from 'vitest';
import { EXPERIMENTAL_LABEL, interpretRecognition } from './recognition.js';

const base = { threshold: 0.7, frame_sequence: 12, experimental: true, verification: 'unverified_dataset' };

describe('interpretRecognition', () => {
  it('shows a letter only for a recognized prediction', () => {
    const view = interpretRecognition({ ...base, status: 'recognized', label: 'B', confidence: 0.91 });
    expect(view.kind).toBe('letter');
    expect(view.letter).toBe('B');
    expect(view.detail).toContain('91%');
  });

  it.each(['uncertain', 'no_hand', 'two_hands', 'camera_off', 'no_model'])(
    'never shows a letter for status %s, even if a label is present',
    (status) => {
      const view = interpretRecognition({ ...base, status, label: 'C', confidence: 0.4 });
      expect(view.letter).toBeNull();
      expect(view.kind).not.toBe('letter');
    },
  );

  it('explains an uncertain result without presenting it as a letter', () => {
    const view = interpretRecognition({ ...base, status: 'uncertain', confidence: 0.42 });
    expect(view.kind).toBe('uncertain');
    expect(view.headline).toBe('Not sure yet');
    expect(view.detail).toContain('42%');
    expect(view.detail).toContain('70%');
  });

  it('rejects a recognized status whose label is not a single letter', () => {
    const view = interpretRecognition({ ...base, status: 'recognized', label: 'happy birthday', confidence: 0.9 });
    expect(view.kind).toBe('unexpected');
    expect(view.letter).toBeNull();
  });

  it('treats an unknown status as unexpected rather than guessing', () => {
    const view = interpretRecognition({ ...base, status: 'warming_up' });
    expect(view.kind).toBe('unexpected');
    expect(view.letter).toBeNull();
  });

  it('handles a missing or malformed response without throwing', () => {
    expect(interpretRecognition(null).kind).toBe('unexpected');
    expect(interpretRecognition({}).kind).toBe('unexpected');
    expect(interpretRecognition('recognized').kind).toBe('unexpected');
  });

  it('marks every result experimental unless the backend explicitly says it is verified', () => {
    expect(interpretRecognition({ ...base, status: 'no_hand' }).experimental).toBe(true);
    expect(interpretRecognition({ threshold: 0.7, frame_sequence: 1, status: 'no_hand' }).experimental).toBe(true);
    expect(interpretRecognition({ ...base, experimental: false, status: 'no_hand' }).experimental).toBe(false);
  });

  it('exposes the experimental label text used by the popup', () => {
    expect(EXPERIMENTAL_LABEL).toMatch(/Experimental/);
    expect(EXPERIMENTAL_LABEL).toMatch(/unverified/);
  });
});
