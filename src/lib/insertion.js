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

// Chrome's own error messages for executeScript. They are matched by text because Chrome has no error codes for these.
const RESTRICTED_PAGE = /chrome:\/\/|chrome-extension:\/\/|edge:\/\/|about:|chromewebstore|chrome\.google\.com\/webstore|Cannot access a chrome/i;
const NO_TAB_ACCESS = /Cannot access contents of|must request permission|Cannot access/i;

// Runs insertIntoFocusedField on the tab the user is looking at. The activeTab permission covers only that tab, and
// only after the user has invoked SignBridge. Every failure returns a specific reason and Chrome's own error text
// (detail), so the popup can say what to do and a developer can see the real cause.
export async function insertTextIntoActiveTab(text, chromeApi = globalThis.chrome) {
  if (!text) return { ok: false, reason: 'empty' };

  const missing = [];
  if (typeof chromeApi?.tabs?.query !== 'function') missing.push('tabs');
  if (typeof chromeApi?.scripting?.executeScript !== 'function') missing.push('scripting');
  if (missing.length) return { ok: false, reason: 'api_missing', detail: missing.join(', ') };

  let tab;
  try {
    [tab] = await chromeApi.tabs.query({ active: true, currentWindow: true });
  } catch (error) {
    return { ok: false, reason: 'error', detail: errorText(error) };
  }
  if (!tab?.id) return { ok: false, reason: 'no_tab' };

  let results;
  try {
    results = await chromeApi.scripting.executeScript({
      target: { tabId: tab.id },
      func: insertIntoFocusedField,
      args: [text],
    });
  } catch (error) {
    const detail = errorText(error);
    if (RESTRICTED_PAGE.test(detail)) return { ok: false, reason: 'restricted_page', detail };
    if (NO_TAB_ACCESS.test(detail)) return { ok: false, reason: 'no_access', detail };
    return { ok: false, reason: 'error', detail };
  }

  const result = results?.[0]?.result;
  if (!result || typeof result !== 'object') return { ok: false, reason: 'error', detail: 'The page returned no result.' };
  return result;
}

function errorText(error) {
  return String(error?.message ?? error ?? 'unknown error');
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
    no_tab: 'No active browser tab was found. Click the website you want to type into, then try again.',
    api_missing: `SignBridge is missing a Chrome permission it needs (${result?.detail ?? 'scripting'}). Open chrome://extensions, click Reload on SignBridge, then reopen this popup.`,
    restricted_page: 'Chrome does not let extensions change this page (chrome://, extension and Chrome Web Store pages). Open a normal website, click into a text box there, and try again.',
    no_access: 'SignBridge has no access to this tab yet. Chrome grants access only after you click the SignBridge toolbar icon while this website tab is open. Click the icon on this tab, then press Insert into page again.',
    error: `Chrome could not insert the text${result?.detail ? `: ${result.detail}` : '.'}`,
  };
  return { tone: 'error', message: messages[result?.reason] ?? 'Text could not be inserted. Try again.' };
}
