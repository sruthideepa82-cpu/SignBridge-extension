// Inserts text at the caret of the focused field on the active web page.
//
// insertIntoFocusedField runs inside the page through chrome.scripting.executeScript. Chrome serialises that function, so
// it must stay self-contained: it uses no imports and no variables from this module.
// It only changes the one field the user has focused, keeps the existing text, places the caret after the new text,
// and fires an input event so the page notices. It never submits a form or sends a message.
export function insertIntoFocusedField(text) {
  if (!text) return { ok: false, reason: 'empty' };

  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) {
    return { ok: false, reason: 'no_focus' };
  }

  const isTextarea = el.tagName === 'TEXTAREA';
  const isTextInput = el.tagName === 'INPUT' && ['text', 'search', 'url', 'tel'].includes(el.type);

  if (isTextarea || isTextInput) {
    if (el.disabled || el.readOnly) return { ok: false, reason: 'unsupported_field' };
    const start = el.selectionStart;
    const end = el.selectionEnd;
    if (typeof start !== 'number' || typeof end !== 'number') return { ok: false, reason: 'unsupported_field' };

    const value = el.value;
    const nextValue = value.slice(0, start) + text + value.slice(end);
    // Setting the value through the prototype's setter lets frameworks that track the value see the change.
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
    if (setter) {
      setter.call(el, nextValue);
    } else {
      el.value = nextValue;
    }
    const caret = start + text.length;
    el.setSelectionRange(caret, caret);
    el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    return { ok: true, reason: null, kind: isTextarea ? 'textarea' : 'input', length: text.length };
  }

  if (el.isContentEditable) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !el.contains(selection.anchorNode)) {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    if (!document.execCommand('insertText', false, text)) {
      return { ok: false, reason: 'unsupported_field' };
    }
    return { ok: true, reason: null, kind: 'contenteditable', length: text.length };
  }

  return { ok: false, reason: 'unsupported_field' };
}

// Runs insertIntoFocusedField on the tab the user is looking at. The activeTab permission covers only that tab, and
// only after the user has invoked SignBridge. Pages Chrome does not allow extensions to change make executeScript throw.
export async function insertTextIntoActiveTab(text, chromeApi = globalThis.chrome) {
  if (!text) return { ok: false, reason: 'empty' };
  if (!chromeApi?.tabs?.query || !chromeApi?.scripting?.executeScript) {
    return { ok: false, reason: 'unsupported' };
  }

  let tab;
  try {
    [tab] = await chromeApi.tabs.query({ active: true, currentWindow: true });
  } catch {
    return { ok: false, reason: 'error' };
  }
  if (!tab?.id) return { ok: false, reason: 'no_tab' };

  let results;
  try {
    results = await chromeApi.scripting.executeScript({
      target: { tabId: tab.id },
      func: insertIntoFocusedField,
      args: [text],
    });
  } catch {
    return { ok: false, reason: 'blocked' };
  }
  return results?.[0]?.result ?? { ok: false, reason: 'error' };
}

// Plain-language feedback for each result, so the popup can say what to do next.
export function describeInsertion(result) {
  if (result?.ok) {
    return { tone: 'success', message: `Inserted ${result.length} character${result.length === 1 ? '' : 's'} into the page. Nothing was sent or submitted.` };
  }
  const messages = {
    empty: 'There is no text to insert yet.',
    no_focus: 'Click a text box on the website first, then press Insert into page again.',
    unsupported_field: 'This field cannot take inserted text. Click a normal text box, text area or editable area.',
    no_tab: 'No active browser tab was found.',
    blocked: 'SignBridge cannot write to this page. Chrome does not allow extensions on pages such as chrome:// pages or the Chrome Web Store. Open the website, click SignBridge on that tab, then try again.',
    unsupported: 'Inserting text is not available in this browser.',
  };
  return { tone: 'error', message: messages[result?.reason] ?? 'Text could not be inserted. Try again.' };
}
