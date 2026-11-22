import { MAX_FINALS } from './config.js';

// Caption state is held only in the offscreen document's memory. Nothing here touches storage.

export function createCaptionState() {
  return { interim: '', finals: [], lastSeq: 0 };
}

export function applyCaptionMessage(state, message, now = Date.now()) {
  if (!message || typeof message !== 'object') return state;

  if (message.type === 'interim') {
    const text = typeof message.text === 'string' ? message.text.trim() : '';
    if (!text || text === state.interim) return state;
    return { ...state, interim: text };
  }

  if (message.type === 'final') {
    const text = typeof message.text === 'string' ? message.text.trim() : '';
    if (!text || message.seq <= state.lastSeq) return state;
    const finals = [...state.finals, { seq: message.seq, text, at: now }].slice(-MAX_FINALS);
    return { ...state, interim: '', finals, lastSeq: message.seq };
  }

  if (message.type === 'closed' || message.type === 'disconnect') {
    return state.interim ? { ...state, interim: '' } : state;
  }

  return state;
}

export function clearCaptionState(state) {
  return { ...state, interim: '', finals: [] };
}
