import { DEFAULT_LANGUAGE, MAX_FRAME_BYTES, TARGET_SAMPLE_RATE, TRANSCRIPTION_LANGUAGES } from './config.js';

// Wire contract for /api/transcription/live, written from the backend schema:
//   start: { type, encoding, sampleRate, channels, language, seqStart }
//   control: { type: pause | resume | stop | ping }
//   server: ready | state | interim | final | error | pong | closed
// Only the languages this product exposes are accepted.

export const ENCODING = 'pcm_s16le';
export const SAMPLE_RATE = TARGET_SAMPLE_RATE;
export const CHANNELS = 1;

export const CONTROL_TYPES = Object.freeze(['pause', 'resume', 'stop', 'ping']);
export const SERVER_MESSAGE_TYPES = Object.freeze(['ready', 'state', 'interim', 'final', 'error', 'pong', 'closed']);

export const NON_RETRYABLE_CODES = Object.freeze(new Set([
  'invalid_start',
  'transcription_unavailable',
  'gemini_auth_failed',
  'gemini_model_unavailable',
  'gemini_request_rejected',
  'frame_too_large',
  'session_time_limit',
]));

// 1008: origin not allowed / invalid start. 1009: frame too large.
export const FATAL_CLOSE_CODES = Object.freeze([1008, 1009]);

export function assertLanguage(language) {
  if (!TRANSCRIPTION_LANGUAGES.includes(language)) {
    throw new RangeError(`Unsupported transcription language: ${language}`);
  }
  return language;
}

export function buildStartMessage({ language = DEFAULT_LANGUAGE, seqStart = 1 } = {}) {
  if (!Number.isInteger(seqStart) || seqStart < 1) throw new RangeError('seqStart must be a positive integer.');
  return {
    type: 'start',
    encoding: ENCODING,
    sampleRate: SAMPLE_RATE,
    channels: CHANNELS,
    language: assertLanguage(language),
    seqStart,
  };
}

export function buildControlMessage(type) {
  if (!CONTROL_TYPES.includes(type)) throw new RangeError(`Unknown control message: ${type}`);
  return { type };
}

export function isValidAudioFrame(frame) {
  return frame instanceof ArrayBuffer
    && frame.byteLength > 0
    && frame.byteLength % 2 === 0
    && frame.byteLength <= MAX_FRAME_BYTES;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isSequence(value) {
  return Number.isInteger(value) && value >= 1;
}

export function parseServerMessage(raw) {
  if (typeof raw !== 'string') return null;
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(value) || typeof value.type !== 'string') return null;

  switch (value.type) {
    case 'ready':
    case 'pong':
      return { type: value.type };
    case 'state':
      return value.state === 'listening' || value.state === 'paused'
        ? { type: 'state', state: value.state }
        : null;
    case 'interim':
    case 'final':
      return isSequence(value.seq) && typeof value.text === 'string'
        ? { type: value.type, seq: value.seq, text: value.text }
        : null;
    case 'error':
      return typeof value.code === 'string'
        && typeof value.message === 'string'
        && typeof value.recoverable === 'boolean'
        ? { type: 'error', code: value.code, message: value.message, recoverable: value.recoverable }
        : null;
    case 'closed':
      return { type: 'closed', reason: typeof value.reason === 'string' ? value.reason : 'stopped' };
    default:
      return null;
  }
}

export function isFatalCloseCode(code) {
  return FATAL_CLOSE_CODES.includes(code);
}

export function isRetryableError(error) {
  return Boolean(error?.recoverable) && !NON_RETRYABLE_CODES.has(error.code);
}
