// Copies the message with the Clipboard API. Resolves to { ok, reason } and never throws, so the popup can show feedback.
export async function copyText(text, clipboard = globalThis.navigator?.clipboard) {
  if (!clipboard || typeof clipboard.writeText !== 'function') {
    return { ok: false, reason: 'unsupported' };
  }
  try {
    await clipboard.writeText(text);
    return { ok: true, reason: null };
  } catch {
    return { ok: false, reason: 'denied' };
  }
}
