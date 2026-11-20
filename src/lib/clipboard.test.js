import { describe, expect, it, vi } from 'vitest';
import { copyText } from './clipboard.js';

describe('copyText', () => {
  it('copies the message through the Clipboard API', async () => {
    const clipboard = { writeText: vi.fn(async () => {}) };
    await expect(copyText('HELLO', clipboard)).resolves.toEqual({ ok: true, reason: null });
    expect(clipboard.writeText).toHaveBeenCalledWith('HELLO');
  });

  it('reports a denied copy instead of throwing', async () => {
    const clipboard = { writeText: vi.fn(async () => { throw new Error('NotAllowedError'); }) };
    await expect(copyText('HELLO', clipboard)).resolves.toEqual({ ok: false, reason: 'denied' });
  });

  it('reports when the Clipboard API is not available', async () => {
    await expect(copyText('HELLO', undefined)).resolves.toEqual({ ok: false, reason: 'unsupported' });
    await expect(copyText('HELLO', {})).resolves.toEqual({ ok: false, reason: 'unsupported' });
  });
});
