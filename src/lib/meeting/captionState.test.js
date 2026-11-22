import { describe, expect, it } from 'vitest';
import { applyCaptionMessage, clearCaptionState, createCaptionState } from './captionState.js';

describe('caption state', () => {
  it('replaces interim text and keeps finals in order', () => {
    let state = createCaptionState();
    state = applyCaptionMessage(state, { type: 'interim', seq: 1, text: 'hel' }, 10);
    expect(state.interim).toBe('hel');
    state = applyCaptionMessage(state, { type: 'final', seq: 1, text: 'hello' }, 11);
    expect(state.finals).toEqual([{ seq: 1, text: 'hello', at: 11 }]);
    expect(state.interim).toBe('');
    state = applyCaptionMessage(state, { type: 'final', seq: 2, text: 'world' }, 12);
    expect(state.finals.map((entry) => entry.text)).toEqual(['hello', 'world']);
  });

  it('ignores duplicate and stale final sequences', () => {
    let state = applyCaptionMessage(createCaptionState(), { type: 'final', seq: 4, text: 'four' });
    state = applyCaptionMessage(state, { type: 'final', seq: 4, text: 'four' });
    state = applyCaptionMessage(state, { type: 'final', seq: 3, text: 'three' });
    expect(state.finals).toEqual([{ seq: 4, text: 'four', at: expect.any(Number) }]);
  });

  it('ignores empty text and whitespace-only interim updates', () => {
    const state = createCaptionState();
    expect(applyCaptionMessage(state, { type: 'final', seq: 1, text: '   ' })).toBe(state);
    expect(applyCaptionMessage(state, { type: 'interim', seq: 1, text: '   ' })).toBe(state);
  });

  it('clears the unfinished interim on disconnect but keeps confirmed text', () => {
    let state = applyCaptionMessage(createCaptionState(), { type: 'final', seq: 1, text: 'kept' });
    state = applyCaptionMessage(state, { type: 'interim', seq: 2, text: 'unfinished' });
    state = applyCaptionMessage(state, { type: 'disconnect' });
    expect(state.interim).toBe('');
    expect(state.finals).toHaveLength(1);
  });

  it('clears the visible text while keeping the sequence watermark', () => {
    let state = applyCaptionMessage(createCaptionState(), { type: 'final', seq: 7, text: 'old' });
    state = clearCaptionState(state);
    expect(state.finals).toEqual([]);
    expect(state.interim).toBe('');
    expect(state.lastSeq).toBe(7);
    state = applyCaptionMessage(state, { type: 'final', seq: 7, text: 'duplicate' });
    expect(state.finals).toEqual([]);
  });
});
