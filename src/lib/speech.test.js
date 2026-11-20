import { describe, expect, it, vi } from 'vitest';
import { speakText, stopSpeaking } from './speech.js';

function fakeSynth() {
  return { cancel: vi.fn(), speak: vi.fn() };
}

class FakeUtterance {
  constructor(text) {
    this.text = text;
  }
}

describe('speakText', () => {
  it('speaks the message, after cancelling anything already queued', () => {
    const synth = fakeSynth();
    const result = speakText('HELLO', synth, FakeUtterance);
    expect(result.ok).toBe(true);
    expect(synth.cancel).toHaveBeenCalledTimes(1);
    expect(synth.speak).toHaveBeenCalledWith(expect.objectContaining({ text: 'HELLO' }));
    expect(synth.cancel.mock.invocationCallOrder[0]).toBeLessThan(synth.speak.mock.invocationCallOrder[0]);
  });

  it('reports that speech is unsupported when the API is missing', () => {
    expect(speakText('HELLO', undefined, FakeUtterance)).toEqual({ ok: false, reason: 'unsupported' });
    expect(speakText('HELLO', fakeSynth(), undefined)).toEqual({ ok: false, reason: 'unsupported' });
  });
});

describe('stopSpeaking', () => {
  it('cancels speech', () => {
    const synth = fakeSynth();
    stopSpeaking(synth);
    expect(synth.cancel).toHaveBeenCalledTimes(1);
  });

  it('does nothing when speech is unsupported', () => {
    expect(() => stopSpeaking(undefined)).not.toThrow();
  });
});
