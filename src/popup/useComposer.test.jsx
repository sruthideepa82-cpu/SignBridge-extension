import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useComposer } from './useComposer.js';

function makeActions(overrides = {}) {
  return {
    copyText: vi.fn(async () => ({ ok: true, reason: null })),
    speakText: vi.fn(() => ({ ok: true, reason: null, utterance: {} })),
    stopSpeaking: vi.fn(),
    insertTextIntoActiveTab: vi.fn(async () => ({ ok: true, reason: null, kind: 'input', length: 2 })),
    ...overrides,
  };
}

// A storage stub that restores immediately and records what was saved.
function makeStorage(saved = { ok: true, text: '' }) {
  return {
    load: vi.fn(async () => saved),
    save: vi.fn(async () => ({ ok: true })),
  };
}

// Feeds one recognition frame: a letter (or null) with a frame sequence number.
const frame = (letter, sequence) => ({ letter, sequence });

function setup(actions = makeActions()) {
  const hook = renderHook(
    ({ observation }) => useComposer({ observation, actions }),
    { initialProps: { observation: frame(null, null) } },
  );
  const feed = (letter, sequence) => hook.rerender({ observation: frame(letter, sequence) });
  return { ...hook, feed, actions };
}

describe('useComposer: recognition feeds the message', () => {
  it('adds a letter once it is stable, and reports it', () => {
    const { result, feed } = setup();
    for (let seq = 1; seq <= 6; seq += 1) feed('K', seq);
    expect(result.current.text).toBe('K');
    expect(result.current.feedback).toEqual({ tone: 'info', message: 'Added K.' });
  });

  it('does not repeat a letter while the same hand stays in view', () => {
    const { result, feed } = setup();
    for (let seq = 1; seq <= 30; seq += 1) feed('K', seq);
    expect(result.current.text).toBe('K');
  });

  it('keeps manually typed text when new letters are recognised', () => {
    const { result, feed } = setup();
    act(() => result.current.setText('Hi '));
    for (let seq = 1; seq <= 6; seq += 1) feed('T', seq);
    expect(result.current.text).toBe('Hi T');
  });
});

describe('useComposer: editing actions', () => {
  it('adds a space, removes the last character and clears the message', () => {
    const { result } = setup();
    act(() => result.current.setText('HI'));
    act(() => result.current.addSpace());
    expect(result.current.text).toBe('HI ');
    act(() => result.current.backspace());
    expect(result.current.text).toBe('HI');
    act(() => result.current.clear());
    expect(result.current.text).toBe('');
    expect(result.current.feedback.message).toBe('Message cleared.');
  });

  it('lets the user edit the text directly', () => {
    const { result } = setup();
    act(() => result.current.setText('Hello there'));
    expect(result.current.text).toBe('Hello there');
  });
});

describe('useComposer: clipboard', () => {
  it('copies the message and confirms success', async () => {
    const { result, actions } = setup();
    act(() => result.current.setText('HELLO'));
    await act(async () => { await result.current.copy(); });
    expect(actions.copyText).toHaveBeenCalledWith('HELLO');
    expect(result.current.feedback).toEqual({ tone: 'success', message: 'Copied to the clipboard.' });
  });

  it('reports a failed copy and suggests a manual copy', async () => {
    const actions = makeActions({ copyText: vi.fn(async () => ({ ok: false, reason: 'denied' })) });
    const { result } = setup(actions);
    act(() => result.current.setText('HELLO'));
    await act(async () => { await result.current.copy(); });
    expect(result.current.feedback.tone).toBe('error');
    expect(result.current.feedback.message).toMatch(/Copy failed/);
  });

  it('does not copy an empty message', async () => {
    const { result, actions } = setup();
    await act(async () => { await result.current.copy(); });
    expect(actions.copyText).not.toHaveBeenCalled();
    expect(result.current.feedback.message).toMatch(/no text to copy/);
  });
});

describe('useComposer: speech', () => {
  it('speaks only when the user presses Speak, and tracks the speaking state', () => {
    const { result, actions } = setup();
    expect(actions.speakText).not.toHaveBeenCalled();
    act(() => result.current.setText('HI'));
    act(() => result.current.speak());
    expect(actions.speakText).toHaveBeenCalledWith('HI');
    expect(result.current.speaking).toBe(true);
    act(() => result.current.stop());
    expect(actions.stopSpeaking).toHaveBeenCalled();
    expect(result.current.speaking).toBe(false);
  });

  it('clears the speaking state when the utterance ends', () => {
    const utterance = {};
    const actions = makeActions({ speakText: vi.fn(() => ({ ok: true, reason: null, utterance })) });
    const { result } = setup(actions);
    act(() => result.current.setText('HI'));
    act(() => result.current.speak());
    act(() => utterance.onend());
    expect(result.current.speaking).toBe(false);
  });

  it('reports when speech is unavailable, and does not speak an empty message', () => {
    const unsupported = makeActions({ speakText: vi.fn(() => ({ ok: false, reason: 'unsupported' })) });
    const { result } = setup(unsupported);
    act(() => result.current.setText('HI'));
    act(() => result.current.speak());
    expect(result.current.feedback.message).toMatch(/Speech is not available/);

    const { result: empty, actions } = setup();
    act(() => empty.current.speak());
    expect(actions.speakText).not.toHaveBeenCalled();
    expect(empty.current.feedback.message).toMatch(/no text to speak/);
  });
});

describe('useComposer: insertion into the page', () => {
  it('inserts the message and shows the success feedback', async () => {
    const { result, actions } = setup();
    act(() => result.current.setText('HI'));
    await act(async () => { await result.current.insert(); });
    expect(actions.insertTextIntoActiveTab).toHaveBeenCalledWith('HI');
    expect(result.current.feedback.tone).toBe('success');
    expect(result.current.text).toBe('HI');
  });

  it('shows the specific reason when the page does not accept insertion', async () => {
    const actions = makeActions({
      insertTextIntoActiveTab: vi.fn(async () => ({ ok: false, reason: 'no_focus' })),
    });
    const { result } = setup(actions);
    act(() => result.current.setText('HI'));
    await act(async () => { await result.current.insert(); });
    expect(result.current.feedback.tone).toBe('error');
    expect(result.current.feedback.message).toMatch(/Click a text box/);
  });
});

describe('useComposer: session persistence', () => {
  it('restores the saved message and saves each change', async () => {
    const storage = makeStorage({ ok: true, text: 'HELLO' });
    const { result } = renderHook(() => useComposer({ observation: frame(null, null), actions: makeActions(), storage }));
    await act(async () => {});
    expect(result.current.text).toBe('HELLO');

    act(() => result.current.setText('HELLO WORLD'));
    expect(storage.save).toHaveBeenLastCalledWith('HELLO WORLD');
  });

  it('saves a typed change in the same event, before any render or effect runs', async () => {
    const storage = makeStorage();
    const { result } = renderHook(() => useComposer({ observation: frame(null, null), actions: makeActions(), storage }));
    await act(async () => {});
    storage.save.mockClear();

    act(() => {
      result.current.setText('HELLO');
      expect(storage.save).toHaveBeenCalledWith('HELLO');
    });
  });

  it('saves an empty message immediately when Clear is pressed', async () => {
    const storage = makeStorage();
    const { result } = renderHook(() => useComposer({ observation: frame(null, null), actions: makeActions(), storage }));
    await act(async () => {});
    act(() => result.current.setText('OLD'));
    storage.save.mockClear();

    act(() => {
      result.current.clear();
      expect(storage.save).toHaveBeenLastCalledWith('');
    });
  });

  it('keeps the newest change even if the popup closes right after it', async () => {
    const storage = makeStorage();
    const { result, unmount } = renderHook(() => useComposer({ observation: frame(null, null), actions: makeActions(), storage }));
    await act(async () => {});
    act(() => result.current.setText('RAPID'));
    unmount();
    expect(storage.save).toHaveBeenLastCalledWith('RAPID');
  });

  it('keeps the newest Clear even if the popup closes right after it', async () => {
    const storage = makeStorage();
    const { result, unmount } = renderHook(() => useComposer({ observation: frame(null, null), actions: makeActions(), storage }));
    await act(async () => {});
    act(() => result.current.setText('OLD'));
    act(() => result.current.clear());
    unmount();
    expect(storage.save).toHaveBeenLastCalledWith('');
  });

  it('does not overwrite text typed while the restore is still running', async () => {
    let finish;
    const storage = {
      load: vi.fn(() => new Promise((resolve) => { finish = resolve; })),
      save: vi.fn(async () => ({ ok: true })),
    };
    const { result } = renderHook(() => useComposer({ observation: frame(null, null), actions: makeActions(), storage }));
    act(() => result.current.setText('NEW'));
    await act(async () => { finish({ ok: true, text: 'OLD' }); });
    expect(result.current.text).toBe('OLDNEW');
    expect(storage.save).toHaveBeenLastCalledWith('OLDNEW');
  });

  it('does not write anything before the restore has finished', async () => {
    let finish;
    const storage = {
      load: vi.fn(() => new Promise((resolve) => { finish = resolve; })),
      save: vi.fn(async () => ({ ok: true })),
    };
    renderHook(() => useComposer({ observation: frame(null, null), actions: makeActions(), storage }));
    expect(storage.save).not.toHaveBeenCalled();
    await act(async () => { finish({ ok: true, text: '' }); });
    expect(storage.save).not.toHaveBeenCalled();
  });

  it('never writes back after a failed restore, so the saved message is not erased', async () => {
    const storage = makeStorage({ ok: false, reason: 'error', text: '', detail: 'read failed' });
    const { result } = renderHook(() => useComposer({ observation: frame(null, null), actions: makeActions(), storage }));
    await act(async () => {});
    expect(storage.save).not.toHaveBeenCalled();
    expect(result.current.text).toBe('');
    expect(result.current.feedback.message).toMatch(/could not be restored/);
  });

  it('shows a visible warning when session storage is not available', async () => {
    const storage = makeStorage({ ok: false, reason: 'unavailable', text: '' });
    const { result } = renderHook(() => useComposer({ observation: frame(null, null), actions: makeActions(), storage }));
    await act(async () => {});
    expect(result.current.feedback.message).toMatch(/lost when the popup closes/);
  });

  it('shows a visible error when a save fails, instead of ignoring it', async () => {
    const storage = {
      load: vi.fn(async () => ({ ok: true, text: '' })),
      save: vi.fn(async () => ({ ok: false, reason: 'error', detail: 'quota' })),
    };
    const { result } = renderHook(() => useComposer({ observation: frame(null, null), actions: makeActions(), storage }));
    await act(async () => {});
    act(() => result.current.setText('HELLO'));
    await act(async () => {});
    expect(result.current.feedback.tone).toBe('error');
    expect(result.current.feedback.message).toMatch(/could not be saved/);
  });
});
