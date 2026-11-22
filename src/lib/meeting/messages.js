// Runtime message contract shared by the popup, service worker, offscreen document and captions window.
// Every message names its intended receiver, so broadcast delivery cannot create loops.

export const TARGET = Object.freeze({
  BACKGROUND: 'background',
  OFFSCREEN: 'offscreen',
  CAPTIONS: 'captions',
});

export const MSG = Object.freeze({
  MEETING_START: 'meeting.start',
  MEETING_STOP: 'meeting.stop',
  MEETING_STATUS: 'meeting.status',
  MEETING_DIAGNOSTICS: 'meeting.diagnostics',
  CAPTURE_START: 'capture.start',
  CAPTURE_STOP: 'capture.stop',
  CAPTURE_ENDED: 'capture.ended',
  SESSION_STATE: 'session.state',
  SESSION_ERROR: 'session.error',
  SESSION_SNAPSHOT: 'session.snapshot',
  CAPTIONS_UPDATE: 'captions.update',
  CAPTIONS_CLEAR: 'captions.clear',
  CAPTIONS_READY: 'captions.ready',
});

export const ACTIVE_PHASES = Object.freeze(['starting', 'listening', 'reconnecting', 'stopping']);

export function messageFor(target, type, payload = {}) {
  return { target, type, ...payload };
}

export function isMessage(message, target, type = null) {
  return Boolean(message) && message.target === target && (type === null || message.type === type);
}

export function isActivePhase(phase) {
  return ACTIVE_PHASES.includes(phase);
}
