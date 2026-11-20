import { useEffect, useRef, useState } from 'react';
import { copyText } from '../lib/clipboard.js';
import { appendLetter, appendSpace, initialAccumulatorState, observeLetter, removeLastCharacter } from '../lib/composer.js';
import { describeInsertion, insertTextIntoActiveTab } from '../lib/insertion.js';
import { speakText, stopSpeaking } from '../lib/speech.js';

const DEFAULT_ACTIONS = { copyText, speakText, stopSpeaking, insertTextIntoActiveTab };

// Owns the message. Recognised letters are only ever appended here, and the user can edit the text freely.
// observation is { letter, sequence } for the newest recognition result. Each frame is counted once.
export function useComposer({ observation, actions = DEFAULT_ACTIONS } = {}) {
  const [text, setText] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [speaking, setSpeaking] = useState(false);
  const accumulator = useRef(initialAccumulatorState());

  const letter = observation?.letter ?? null;
  const sequence = observation?.sequence ?? null;

  useEffect(() => {
    const next = observeLetter(accumulator.current, { letter, sequence, now: Date.now() });
    accumulator.current = next.state;
    if (next.commit) {
      setText((current) => appendLetter(current, next.commit));
      setFeedback({ tone: 'info', message: `Added ${next.commit}.` });
    }
  }, [letter, sequence]);

  useEffect(() => () => actions.stopSpeaking(), [actions]);

  const addSpace = () => setText((current) => appendSpace(current));
  const backspace = () => setText((current) => removeLastCharacter(current));
  const clear = () => {
    setText('');
    setFeedback({ tone: 'info', message: 'Message cleared.' });
  };

  const copy = async () => {
    if (!text) return setFeedback({ tone: 'error', message: 'There is no text to copy yet.' });
    const result = await actions.copyText(text);
    if (result.ok) return setFeedback({ tone: 'success', message: 'Copied to the clipboard.' });
    if (result.reason === 'unsupported') {
      return setFeedback({ tone: 'error', message: 'Copying is not available in this browser.' });
    }
    return setFeedback({ tone: 'error', message: 'Copy failed. Select the text and copy it manually.' });
  };

  const speak = () => {
    if (!text) return setFeedback({ tone: 'error', message: 'There is no text to speak yet.' });
    const result = actions.speakText(text);
    if (!result.ok) {
      return setFeedback({ tone: 'error', message: 'Speech is not available in this browser.' });
    }
    setSpeaking(true);
    setFeedback({ tone: 'info', message: 'Speaking the message.' });
    if (result.utterance) {
      result.utterance.onend = () => setSpeaking(false);
      result.utterance.onerror = () => setSpeaking(false);
    }
  };

  const stop = () => {
    actions.stopSpeaking();
    setSpeaking(false);
    setFeedback({ tone: 'info', message: 'Stopped speaking.' });
  };

  const insert = async () => {
    const result = await actions.insertTextIntoActiveTab(text);
    setFeedback(describeInsertion(result));
  };

  return {
    text, setText, feedback, speaking,
    addSpace, backspace, clear, copy, speak, stop, insert,
  };
}
