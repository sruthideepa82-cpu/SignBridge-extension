import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  STARTUP_REASON,
  STARTUP_STAGE,
  StartupError,
  classifyRuntimeError,
  sendMeetingMessage,
  withTimeout,
} from './startup.js';

describe('startup diagnostics', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('classifies worker, port, reload and tab errors', () => {
    expect(classifyRuntimeError(new Error('Could not establish connection. Receiving end does not exist.')).reason)
      .toBe(STARTUP_REASON.WORKER_UNAVAILABLE);
    expect(classifyRuntimeError(new Error('The message port closed before a response was received.')).reason)
      .toBe(STARTUP_REASON.WORKER_CLOSED);
    expect(classifyRuntimeError(new Error('Extension context invalidated.')).reason)
      .toBe(STARTUP_REASON.EXTENSION_RELOADED);
    expect(classifyRuntimeError(new Error('No tab with id: 42.')).reason)
      .toBe(STARTUP_REASON.NO_TAB);
    expect(classifyRuntimeError(new Error('Something else')).reason).toBe(STARTUP_REASON.WORKER_ERROR);
  });

  it('always returns a categorized object and never null', async () => {
    expect(await sendMeetingMessage(async () => undefined, { type: 'x' }))
      .toMatchObject({ ok: false, reason: STARTUP_REASON.WORKER_NO_RESPONSE });
    expect(await sendMeetingMessage(async () => {
      throw new Error('Receiving end does not exist');
    }, { type: 'x' })).toMatchObject({ ok: false, reason: STARTUP_REASON.WORKER_UNAVAILABLE });
    expect(await sendMeetingMessage(async () => ({ ok: true }), { type: 'x' })).toEqual({ ok: true });
  });

  it('returns worker_timeout instead of hanging forever', async () => {
    vi.useFakeTimers();
    const pending = new Promise(() => {});
    const result = sendMeetingMessage(() => pending, { type: 'x' }, { timeoutMs: 1000, stage: 'popup_start' });
    await vi.advanceTimersByTimeAsync(1000);
    await expect(result).resolves.toMatchObject({
      ok: false,
      reason: STARTUP_REASON.WORKER_TIMEOUT,
      stage: 'popup_start',
    });
  });

  it('wraps stage timeouts with the stage and reason', async () => {
    vi.useFakeTimers();
    const pending = new Promise(() => {});
    const result = withTimeout(pending, 500, {
      reason: STARTUP_REASON.STREAM_ID_TIMEOUT,
      stage: STARTUP_STAGE.STREAM_ID,
      detail: 'slow',
    });
    const settled = result.catch((error) => error);
    await vi.advanceTimersByTimeAsync(500);
    const error = await settled;
    expect(error).toBeInstanceOf(StartupError);
    expect(error).toMatchObject({
      reason: STARTUP_REASON.STREAM_ID_TIMEOUT,
      stage: STARTUP_STAGE.STREAM_ID,
      detail: 'slow',
    });
  });

  it('clears the timeout after a fast success', async () => {
    vi.useFakeTimers();
    const result = await withTimeout(Promise.resolve('ok'), 5000, {
      reason: STARTUP_REASON.STARTUP_TIMEOUT,
      stage: STARTUP_STAGE.CLEANUP,
    });
    expect(result).toBe('ok');
    expect(vi.getTimerCount()).toBe(0);
  });
});
