import { describe, expect, it } from 'vitest';
import {
  buildControlMessage,
  buildStartMessage,
  isRetryableError,
  isValidAudioFrame,
  parseServerMessage,
} from './protocol.js';

describe('transcription protocol', () => {
  it('builds the start message the backend expects', () => {
    expect(buildStartMessage({ language: 'auto', seqStart: 4 })).toEqual({
      type: 'start',
      encoding: 'pcm_s16le',
      sampleRate: 16000,
      channels: 1,
      language: 'auto',
      seqStart: 4,
    });
  });

  it('rejects unsupported languages and bad sequence numbers', () => {
    expect(() => buildStartMessage({ language: 'fr-FR' })).toThrow(/language/i);
    expect(() => buildStartMessage({ seqStart: 0 })).toThrow(/seqStart/i);
  });

  it('builds only the documented control messages', () => {
    expect(buildControlMessage('stop')).toEqual({ type: 'stop' });
    expect(() => buildControlMessage('mute')).toThrow(/control/i);
  });

  it('accepts only valid PCM frames', () => {
    expect(isValidAudioFrame(new ArrayBuffer(3200))).toBe(true);
    expect(isValidAudioFrame(new ArrayBuffer(0))).toBe(false);
    expect(isValidAudioFrame(new ArrayBuffer(3))).toBe(false);
    expect(isValidAudioFrame(new ArrayBuffer(32002))).toBe(false);
    expect(isValidAudioFrame('frame')).toBe(false);
  });

  it('parses ready, pong, state, interim, final, error and closed messages', () => {
    expect(parseServerMessage('{"type":"ready"}')).toEqual({ type: 'ready' });
    expect(parseServerMessage('{"type":"pong"}')).toEqual({ type: 'pong' });
    expect(parseServerMessage('{"type":"state","state":"listening"}')).toEqual({ type: 'state', state: 'listening' });
    expect(parseServerMessage('{"type":"interim","seq":2,"text":"hel"}')).toEqual({ type: 'interim', seq: 2, text: 'hel' });
    expect(parseServerMessage('{"type":"final","seq":3,"text":"hello"}')).toEqual({ type: 'final', seq: 3, text: 'hello' });
    expect(parseServerMessage('{"type":"error","code":"gemini_rate_limited","message":"slow","recoverable":true}'))
      .toEqual({ type: 'error', code: 'gemini_rate_limited', message: 'slow', recoverable: true });
    expect(parseServerMessage('{"type":"closed","reason":"stopped"}')).toEqual({ type: 'closed', reason: 'stopped' });
  });

  it('rejects malformed or unknown server messages', () => {
    expect(parseServerMessage('not json')).toBeNull();
    expect(parseServerMessage('[]')).toBeNull();
    expect(parseServerMessage('{"type":"mystery"}')).toBeNull();
    expect(parseServerMessage('{"type":"final","seq":0,"text":"x"}')).toBeNull();
    expect(parseServerMessage('{"type":"error","code":"x","message":"m"}')).toBeNull();
    expect(parseServerMessage({ type: 'ready' })).toBeNull();
  });

  it('marks only recoverable non-fatal backend errors as retryable', () => {
    expect(isRetryableError({ code: 'gemini_rate_limited', recoverable: true })).toBe(true);
    expect(isRetryableError({ code: 'gemini_rate_limited', recoverable: false })).toBe(false);
    expect(isRetryableError({ code: 'gemini_auth_failed', recoverable: true })).toBe(false);
    expect(isRetryableError(null)).toBe(false);
  });
});
