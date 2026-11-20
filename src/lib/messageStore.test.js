import { describe, expect, it, vi } from 'vitest';
import { MESSAGE_KEY, loadMessage, saveMessage } from './messageStore.js';

function fakeArea(initial = {}) {
  const data = { ...initial };
  return {
    data,
    get: vi.fn(async (key) => ({ [key]: data[key] })),
    set: vi.fn(async (items) => Object.assign(data, items)),
  };
}

describe('messageStore (chrome.storage.session)', () => {
  it('saves the message under one key in the session area', async () => {
    const area = fakeArea();
    await expect(saveMessage('HELLO', area)).resolves.toEqual({ ok: true });
    expect(area.set).toHaveBeenCalledWith({ [MESSAGE_KEY]: 'HELLO' });
  });

  it('saves an empty message, so Clear overwrites the previous message', async () => {
    const area = fakeArea({ [MESSAGE_KEY]: 'OLD' });
    await expect(saveMessage('', area)).resolves.toEqual({ ok: true });
    expect(area.data[MESSAGE_KEY]).toBe('');
  });

  it('restores the saved message when the popup reopens', async () => {
    const area = fakeArea({ [MESSAGE_KEY]: 'HELLO' });
    await expect(loadMessage(area)).resolves.toEqual({ ok: true, text: 'HELLO' });
    expect(area.get).toHaveBeenCalledWith(MESSAGE_KEY);
  });

  it('restores an empty message when nothing was saved or the stored value is not text', async () => {
    await expect(loadMessage(fakeArea())).resolves.toEqual({ ok: true, text: '' });
    await expect(loadMessage(fakeArea({ [MESSAGE_KEY]: 42 }))).resolves.toEqual({ ok: true, text: '' });
  });

  it('reports unavailable storage instead of pretending the save worked', async () => {
    await expect(loadMessage(null)).resolves.toEqual({ ok: false, reason: 'unavailable', text: '' });
    await expect(saveMessage('HELLO', null)).resolves.toEqual({ ok: false, reason: 'unavailable' });
  });

  it('reports a failing read or write with the reason, instead of hiding it', async () => {
    const failing = {
      get: vi.fn(async () => { throw new Error('quota'); }),
      set: vi.fn(async () => { throw new Error('quota exceeded'); }),
    };
    await expect(loadMessage(failing)).resolves.toEqual({ ok: false, reason: 'error', detail: 'quota', text: '' });
    await expect(saveMessage('HELLO', failing)).resolves.toEqual({ ok: false, reason: 'error', detail: 'quota exceeded' });
  });
});
