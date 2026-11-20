import { COMPOSER_COOLDOWN_MS, COMPOSER_STABLE_FRAMES } from './config.js';

// Turns a stream of recognition observations into letters that may be added to the message.
//
// Each observation is { letter, sequence, now }. letter is a single letter when the backend reported "recognized",
// otherwise null. sequence is the backend frame number, so a frame that is reported twice counts once.
// observe() returns the next state and the letter to add now, or null.
export function initialAccumulatorState() {
  return {
    lastSequence: null,
    candidate: null,
    count: 0,
    locked: null,
    lastCommitAt: null,
  };
}

export function observeLetter(state, { letter, sequence = null, now }, options = {}) {
  const stableFrames = options.stableFrames ?? COMPOSER_STABLE_FRAMES;
  const cooldownMs = options.cooldownMs ?? COMPOSER_COOLDOWN_MS;

  if (sequence !== null && sequence === state.lastSequence) {
    return { state, commit: null };
  }
  const next = { ...state, lastSequence: sequence };

  if (letter === null || letter === undefined) {
    // No letter in this frame: the hand has been released, so the same letter may be added again later.
    return { state: { ...next, candidate: null, count: 0, locked: null }, commit: null };
  }

  if (letter !== state.candidate) {
    next.candidate = letter;
    next.count = 1;
    if (letter !== state.locked) next.locked = null;
  } else {
    next.count = state.count + 1;
  }

  const cooledDown = next.lastCommitAt === null || now - next.lastCommitAt >= cooldownMs;
  if (next.count >= stableFrames && next.locked !== letter && cooledDown) {
    return {
      state: { ...next, count: 0, locked: letter, lastCommitAt: now },
      commit: letter,
    };
  }
  return { state: next, commit: null };
}

// Message editing. These helpers only add or remove text at the end. Recognition never rewrites what the user typed.
export function appendLetter(text, letter) {
  return `${text}${letter}`;
}

export function appendSpace(text) {
  return `${text} `;
}

// Removes one character, counting an emoji or other surrogate pair as one character.
export function removeLastCharacter(text) {
  const characters = Array.from(text);
  characters.pop();
  return characters.join('');
}
