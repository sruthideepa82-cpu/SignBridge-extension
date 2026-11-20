import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeInsertion, insertIntoFocusedField, insertTextIntoActiveTab } from './insertion.js';

function focused(element) {
  document.body.appendChild(element);
  element.focus();
  return element;
}

// jsdom does not compute isContentEditable or focus a plain div, so the test sets both to match a browser.
function focusedEditable(text = '') {
  const editable = document.createElement('div');
  editable.setAttribute('contenteditable', 'true');
  editable.tabIndex = 0;
  editable.textContent = text;
  Object.defineProperty(editable, 'isContentEditable', { value: true });
  return focused(editable);
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  delete document.execCommand;
});

describe('insertIntoFocusedField (runs inside the page)', () => {
  it('inserts at the caret of a text input and keeps the existing text', () => {
    const input = focused(Object.assign(document.createElement('input'), { type: 'text', value: 'Hello world' }));
    input.setSelectionRange(5, 5);
    const onInput = vi.fn();
    input.addEventListener('input', onInput);

    const result = insertIntoFocusedField(' big');

    expect(result).toMatchObject({ ok: true, kind: 'input', length: 4 });
    expect(input.value).toBe('Hello big world');
    expect(input.selectionStart).toBe(9);
    expect(input.selectionEnd).toBe(9);
    expect(onInput).toHaveBeenCalledTimes(1);
  });

  it('inserts into a textarea and replaces a selected range', () => {
    const area = focused(Object.assign(document.createElement('textarea'), { value: 'ABCDEF' }));
    area.setSelectionRange(1, 4);
    const result = insertIntoFocusedField('xy');
    expect(result).toMatchObject({ ok: true, kind: 'textarea' });
    expect(area.value).toBe('AxyEF');
    expect(area.selectionStart).toBe(3);
  });

  it('inserts into a contenteditable area through execCommand', () => {
    focusedEditable('Draft');
    document.execCommand = vi.fn(() => true);

    const result = insertIntoFocusedField('HI');

    expect(result).toMatchObject({ ok: true, kind: 'contenteditable', length: 2 });
    expect(document.execCommand).toHaveBeenCalledWith('insertText', false, 'HI');
  });

  it('reports an unsupported field when the browser refuses the contenteditable insert', () => {
    focusedEditable();
    document.execCommand = vi.fn(() => false);
    expect(insertIntoFocusedField('HI')).toEqual({ ok: false, reason: 'unsupported_field' });
  });

  it.each([
    ['a password field', () => Object.assign(document.createElement('input'), { type: 'password', value: 'x' })],
    ['a checkbox', () => Object.assign(document.createElement('input'), { type: 'checkbox' })],
    ['a read-only field', () => Object.assign(document.createElement('input'), { type: 'text', readOnly: true, value: 'x' })],
    ['a plain button', () => document.createElement('button')],
  ])('refuses %s without changing it', (_name, make) => {
    const element = focused(make());
    const before = element.value;
    expect(insertIntoFocusedField('HI')).toEqual({ ok: false, reason: 'unsupported_field' });
    expect(element.value).toBe(before);
  });

  it('does not change a disabled field, which cannot take focus', () => {
    const area = Object.assign(document.createElement('textarea'), { disabled: true, value: 'x' });
    document.body.appendChild(area);
    area.focus();
    expect(insertIntoFocusedField('HI')).toMatchObject({ ok: false });
    expect(area.value).toBe('x');
  });

  it('reports no focus when nothing editable is focused', () => {
    document.body.appendChild(document.createElement('p'));
    document.activeElement?.blur?.();
    expect(insertIntoFocusedField('HI')).toEqual({ ok: false, reason: 'no_focus' });
  });

  it('does nothing for empty text', () => {
    focused(Object.assign(document.createElement('input'), { type: 'text', value: 'x' }));
    expect(insertIntoFocusedField('')).toEqual({ ok: false, reason: 'empty' });
  });

  it('tells a framework-tracked field about the change, like typing would', () => {
    const input = focused(Object.assign(document.createElement('input'), { type: 'text', value: 'ab' }));
    input.setSelectionRange(2, 2);
    // Mimics React's value tracker: it keeps its own copy of the value and compares it on every input event.
    let tracked = input.value;
    Object.defineProperty(input, 'value', {
      configurable: true,
      get() { return Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').get.call(this); },
      set(next) { tracked = next; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(this, next); },
    });
    const onChange = vi.fn();
    input.addEventListener('input', () => {
      if (input.value !== tracked) {
        tracked = input.value;
        onChange(input.value);
      }
    });

    insertIntoFocusedField('C');

    expect(onChange).toHaveBeenCalledWith('abC');
  });
});

// Chrome's injection path, simulated: the mock runs the real page function on a real element, as Chrome would.
function chromeWithPage({ tabs = [{ id: 7 }], execute, queryError } = {}) {
  return {
    tabs: {
      query: vi.fn(async () => {
        if (queryError) throw queryError;
        return tabs;
      }),
    },
    scripting: {
      executeScript: execute ?? vi.fn(async ({ func, args }) => [{ result: func(...args) }]),
    },
  };
}

describe('insertTextIntoActiveTab (popup side)', () => {
  it('inserts into an input on an ordinary webpage through the injected function', async () => {
    const input = focused(Object.assign(document.createElement('input'), { type: 'text', value: 'Hi ' }));
    input.setSelectionRange(3, 3);
    const chromeApi = chromeWithPage();

    const result = await insertTextIntoActiveTab('there', chromeApi);

    expect(chromeApi.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
    expect(chromeApi.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 7 },
      func: insertIntoFocusedField,
      args: ['there'],
    });
    expect(result).toMatchObject({ ok: true, kind: 'input' });
    expect(input.value).toBe('Hi there');
  });

  it('inserts into a textarea on an ordinary webpage through the injected function', async () => {
    const area = focused(Object.assign(document.createElement('textarea'), { value: 'Note: ' }));
    area.setSelectionRange(6, 6);
    const result = await insertTextIntoActiveTab('OK', chromeWithPage());
    expect(result).toMatchObject({ ok: true, kind: 'textarea' });
    expect(area.value).toBe('Note: OK');
  });

  it('reports api_missing with the missing permission when chrome.scripting is absent', async () => {
    const chromeApi = { tabs: { query: vi.fn(async () => [{ id: 7 }]) } };
    const result = await insertTextIntoActiveTab('HI', chromeApi);
    expect(result).toEqual({ ok: false, reason: 'api_missing', detail: 'scripting' });
    expect(describeInsertion(result).message).toMatch(/Reload on SignBridge/);
  });

  it('reports api_missing when chrome.tabs is absent', async () => {
    const result = await insertTextIntoActiveTab('HI', { scripting: { executeScript: vi.fn() } });
    expect(result).toEqual({ ok: false, reason: 'api_missing', detail: 'tabs' });
  });

  it('reports restricted_page for chrome:// and Chrome Web Store pages', async () => {
    const restricted = [
      'Cannot access a chrome:// URL',
      'Cannot access contents of url "https://chromewebstore.google.com/detail/x". Extension manifest must request permission',
    ];
    for (const message of restricted) {
      const chromeApi = chromeWithPage({ execute: vi.fn(async () => { throw new Error(message); }) });
      const result = await insertTextIntoActiveTab('HI', chromeApi);
      expect(result.reason).toBe('restricted_page');
      expect(result.detail).toBe(message);
      expect(describeInsertion(result).message).toMatch(/Open a normal website/);
    }
  });

  it('reports no_access, with a next step, when activeTab has not been granted to the tab', async () => {
    const message = 'Cannot access contents of the page. Extension manifest must request permission to access the respective host.';
    const chromeApi = chromeWithPage({ execute: vi.fn(async () => { throw new Error(message); }) });
    const result = await insertTextIntoActiveTab('HI', chromeApi);
    expect(result).toEqual({ ok: false, reason: 'no_access', detail: message });
    expect(describeInsertion(result).message).toMatch(/click the SignBridge toolbar icon/i);
  });

  it('keeps Chrome\'s error text for an unexpected failure instead of guessing', async () => {
    const chromeApi = chromeWithPage({ execute: vi.fn(async () => { throw new Error('Something new'); }) });
    const result = await insertTextIntoActiveTab('HI', chromeApi);
    expect(result).toEqual({ ok: false, reason: 'error', detail: 'Something new' });
    expect(describeInsertion(result).message).toMatch(/Something new/);
  });

  it('reports an error when the injected function returns no result', async () => {
    const chromeApi = chromeWithPage({ execute: vi.fn(async () => []) });
    const result = await insertTextIntoActiveTab('HI', chromeApi);
    expect(result.reason).toBe('error');
  });

  it('reports no_tab when there is no active tab, and error when tab lookup fails', async () => {
    await expect(insertTextIntoActiveTab('HI', chromeWithPage({ tabs: [] }))).resolves.toEqual({ ok: false, reason: 'no_tab' });
    const failing = await insertTextIntoActiveTab('HI', chromeWithPage({ queryError: new Error('boom') }));
    expect(failing).toEqual({ ok: false, reason: 'error', detail: 'boom' });
  });

  it('does not touch the page for empty text', async () => {
    const chromeApi = chromeWithPage();
    await expect(insertTextIntoActiveTab('', chromeApi)).resolves.toEqual({ ok: false, reason: 'empty' });
    expect(chromeApi.scripting.executeScript).not.toHaveBeenCalled();
  });
});

describe('describeInsertion', () => {
  it('confirms success and says nothing was sent', () => {
    const message = describeInsertion({ ok: true, length: 2 });
    expect(message.tone).toBe('success');
    expect(message.message).toMatch(/Inserted 2 characters/);
    expect(message.message).toMatch(/Nothing was sent or submitted/);
  });

  it('gives a next step for each known failure', () => {
    expect(describeInsertion({ ok: false, reason: 'no_focus' }).message).toMatch(/Click a text box/);
    expect(describeInsertion({ ok: false, reason: 'unsupported_field' }).message).toMatch(/cannot take inserted text/);
    expect(describeInsertion({ ok: false, reason: 'api_missing', detail: 'scripting' }).message).toMatch(/scripting/);
    expect(describeInsertion({ ok: false, reason: 'restricted_page' }).message).toMatch(/chrome:\/\//);
    expect(describeInsertion({ ok: false, reason: 'no_access' }).message).toMatch(/toolbar icon/);
    expect(describeInsertion({ ok: false, reason: 'no_tab' }).message).toMatch(/No active browser tab/);
    expect(describeInsertion({ ok: false, reason: 'error', detail: 'x' }).message).toMatch(/: x/);
    expect(describeInsertion({ ok: false, reason: 'error', detail: 'x' }).tone).toBe('error');
  });

  it('never shows the old generic "not available in this browser" message', () => {
    for (const reason of ['api_missing', 'restricted_page', 'no_access', 'error', 'unknown_reason']) {
      expect(describeInsertion({ ok: false, reason }).message).not.toMatch(/not available in this browser/);
    }
  });
});
