// Keeps the composed message while the popup is closed and reopened, for the current browser session only.
//
// chrome.storage.session is memory-only: it is cleared when the browser closes (and when the extension is reloaded),
// it is never synced to other devices, and it is never written to disk. It needs the "storage" permission.
// Every call reports its outcome, so the popup can tell the user when the message could not be saved or restored.
export const MESSAGE_KEY = 'signbridge.message';

function sessionArea() {
  return globalThis.chrome?.storage?.session ?? null;
}

function failure(error) {
  return { ok: false, reason: 'error', detail: String(error?.message ?? error ?? 'unknown error') };
}

// Resolves to { ok: true, text } or { ok: false, reason: 'unavailable' | 'error', text: '' }.
export async function loadMessage(area = sessionArea()) {
  if (!area) return { ok: false, reason: 'unavailable', text: '' };
  try {
    const stored = await area.get(MESSAGE_KEY);
    const value = stored?.[MESSAGE_KEY];
    return { ok: true, text: typeof value === 'string' ? value : '' };
  } catch (error) {
    return { ...failure(error), text: '' };
  }
}

// Resolves to { ok: true } or { ok: false, reason: 'unavailable' | 'error' }. An empty string is saved as well, so
// clearing the message overwrites the previous one.
export async function saveMessage(text, area = sessionArea()) {
  if (!area) return { ok: false, reason: 'unavailable' };
  try {
    await area.set({ [MESSAGE_KEY]: text });
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}
