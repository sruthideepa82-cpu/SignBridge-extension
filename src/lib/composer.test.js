import { describe, expect, it } from 'vitest';
import {
  appendLetter, appendSpace, initialAccumulatorState, observeLetter, removeLastCharacter,
} from './composer.js';

const OPTIONS = { stableFrames: 3, cooldownMs: 1000 };

// Feeds a list of [letter, sequence, now] observations and returns every letter that was added, in order.
function run(observations, options = OPTIONS) {
  let state = initialAccumulatorState();
  const added = [];
  for (const [letter, sequence, now] of observations) {
    const next = observeLetter(state, { letter, sequence, now }, options);
    state = next.state;
    if (next.commit) added.push(next.commit);
  }
  return added;
}

describe('observeLetter (stable-letter accumulation)', () => {
  it('adds a letter only after it is stable for the required number of frames', () => {
    expect(run([['A', 1, 0], ['A', 2, 100]])).toEqual([]);
    expect(run([['A', 1, 0], ['A', 2, 100], ['A', 3, 200]])).toEqual(['A']);
  });

  it('counts each backend frame once, even if the same frame is polled again', () => {
    expect(run([['A', 1, 0], ['A', 1, 50], ['A', 1, 100], ['A', 1, 150]])).toEqual([]);
  });

  it('does not add the same letter over and over while the hand is held', () => {
    const held = Array.from({ length: 30 }, (_, i) => ['K', i + 1, 1500 + i * 100]);
    expect(run(held)).toEqual(['K']);
  });

  it('adds the same letter again only after the hand is released', () => {
    const observations = [
      ['M', 1, 0], ['M', 2, 100], ['M', 3, 200],
      [null, 4, 300],
      ['M', 5, 1500], ['M', 6, 1600], ['M', 7, 1700],
    ];
    expect(run(observations)).toEqual(['M', 'M']);
  });

  it('treats an uncertain or no-hand frame (letter null) as a release', () => {
    const observations = [
      ['S', 1, 0], ['S', 2, 100], ['S', 3, 200],
      [null, 4, 300],
      ['S', 5, 1500], ['S', 6, 1600], ['S', 7, 1700],
    ];
    expect(run(observations)).toEqual(['S', 'S']);
  });

  it('does not add a letter during the cooldown after the previous one', () => {
    const observations = [
      ['A', 1, 0], ['A', 2, 100], ['A', 3, 200],
      ['B', 4, 300], ['B', 5, 400], ['B', 6, 500],
      ['B', 7, 900], ['B', 8, 950],
    ];
    expect(run(observations)).toEqual(['A']);
    expect(run(observations.concat([['B', 9, 1300]]))).toEqual(['A', 'B']);
  });

  it('restarts the stable count when the recognised letter changes', () => {
    expect(run([['A', 1, 0], ['A', 2, 100], ['B', 3, 200], ['B', 4, 300]])).toEqual([]);
  });

  it('uses the configured stable-frame count and cooldown', () => {
    const observations = [['C', 1, 0], ['C', 2, 10]];
    expect(run(observations, { stableFrames: 2, cooldownMs: 1000 })).toEqual(['C']);
  });

  it('accepts observations without a frame sequence, but still requires stable repeats', () => {
    let state = initialAccumulatorState();
    const commits = [];
    for (const now of [0, 100, 200]) {
      const next = observeLetter(state, { letter: 'D', sequence: null, now }, OPTIONS);
      state = next.state;
      if (next.commit) commits.push(next.commit);
    }
    expect(commits).toEqual(['D']);
  });
});

describe('message editing helpers', () => {
  it('appends a recognised letter to the end of the message', () => {
    expect(appendLetter('HI', 'T')).toBe('HIT');
    expect(appendLetter('', 'A')).toBe('A');
  });

  it('adds a space at the end', () => {
    expect(appendSpace('HI')).toBe('HI ');
  });

  it('removes one character, keeping an emoji (a surrogate pair) whole', () => {
    expect(removeLastCharacter('HELLO')).toBe('HELL');
    expect(removeLastCharacter('A😀')).toBe('A');
    expect(removeLastCharacter('')).toBe('');
  });
});
