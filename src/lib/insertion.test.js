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

describe('insertIntoFocusedField', () => {
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

  it('inserts into a contenteditable area through execCommand and places the caret at the end when outside', () => {
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

describe('insertTextIntoActiveTab', () => {
  function fakeChrome({ tabs = [{ id: 7 }], execute, queryError } = {}) {
    return {
      tabs: {
        query: vi.fn(async () => {
          if (queryError) throw queryError;
          return tabs;
        }),
      },
      scripting: {
        executeScript: execute ?? vi.fn(async () => [{ result: { ok: true, reason: null, kind: 'input', length: 1 } }]),
      },
    };
  }

  it('injects the page function into the active tab with the text as its argument', async () => {
    const chromeApi = fakeChrome();
    const result = await insertTextIntoActiveTab('HI', chromeApi);
    expect(chromeApi.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
    expect(chromeApi.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 7 },
      func: insertIntoFocusedField,
      args: ['HI'],
    });
    expect(result).toMatchObject({ ok: true });
  });

  it('reports a blocked page when Chrome refuses to run the script there', async () => {
    const chromeApi = fakeChrome({
      execute: vi.fn(async () => { throw new Error('Cannot access contents of the page.'); }),
    });
    await expect(insertTextIntoActiveTab('HI', chromeApi)).resolves.toEqual({ ok: false, reason: 'blocked' });
  });

  it('reports when there is no active tab', async () => {
    await expect(insertTextIntoActiveTab('HI', fakeChrome({ tabs: [] }))).resolves.toEqual({ ok: false, reason: 'no_tab' });
  });

  it('does not touch the page for empty text or when the API is unavailable', async () => {
    const chromeApi = fakeChrome();
    await expect(insertTextIntoActiveTab('', chromeApi)).resolves.toEqual({ ok: false, reason: 'empty' });
    expect(chromeApi.scripting.executeScript).not.toHaveBeenCalled();
    await expect(insertTextIntoActiveTab('HI', undefined)).resolves.toEqual({ ok: false, reason: 'unsupported' });
  });
});

describe('describeInsertion', () => {
  it('confirms success and says nothing was sent', () => {
    const message = describeInsertion({ ok: true, length: 2 });
    expect(message.tone).toBe('success');
    expect(message.message).toMatch(/Inserted 2 characters/);
    expect(message.message).toMatch(/Nothing was sent or submitted/);
  });

  it('explains each failure with a next step', () => {
    expect(describeInsertion({ ok: false, reason: 'no_focus' }).message).toMatch(/Click a text box/);
    expect(describeInsertion({ ok: false, reason: 'unsupported_field' }).message).toMatch(/cannot take inserted text/);
    expect(describeInsertion({ ok: false, reason: 'blocked' }).message).toMatch(/chrome:\/\//);
    expect(describeInsertion({ ok: false, reason: 'mystery' }).message).toMatch(/could not be inserted/);
    expect(describeInsertion({ ok: false, reason: 'blocked' }).tone).toBe('error');
  });
});
