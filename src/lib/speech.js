// Text-to-speech through the browser's SpeechSynthesis API. Only the popup calls these, and only after an explicit click.
export function speakText(text, synth = globalThis.speechSynthesis, UtteranceClass = globalThis.SpeechSynthesisUtterance) {
  if (!synth || typeof UtteranceClass !== 'function') {
    return { ok: false, reason: 'unsupported' };
  }
  synth.cancel();
  const utterance = new UtteranceClass(text);
  synth.speak(utterance);
  return { ok: true, reason: null, utterance };
}

export function stopSpeaking(synth = globalThis.speechSynthesis) {
  synth?.cancel();
}
