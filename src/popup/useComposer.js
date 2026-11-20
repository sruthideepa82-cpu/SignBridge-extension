import { useEffect, useRef, useState } from 'react';
import { copyText } from '../lib/clipboard.js';
import { appendLetter, appendSpace, initialAccumulatorState, observeLetter, removeLastCharacter } from '../lib/composer.js';
import { describeInsertion, insertTextIntoActiveTab } from '../lib/insertion.js';
import { loadMessage, saveMessage } from '../lib/messageStore.js';
import { speakText, stopSpeaking } from '../lib/speech.js';

const DEFAULT_ACTIONS = { copyText, speakText, stopSpeaking, insertTextIntoActiveTab };
const DEFAULT_STORAGE = { load: () => loadMessage(), save: (text) => saveMessage(text) };

const UNAVAILABLE_MESSAGE = {
  tone: 'error',
  message: 'Session saving is not available, so this message will be lost when the popup closes.',
};
const SAVE_FAILED_MESSAGE = {
  tone: 'error',
  message: 'The message could not be saved. Copy it before closing the popup.',
};
const RESTORE_FAILED_MESSAGE = {
  tone: 'error',
  message: 'The previous message could not be restored. Your new text will be saved.',
};

// Owns the message. Recognised letters are only ever appended here, and the user can edit the text freely.
// observation is { letter, sequence } for the newest recognition result. Each frame is counted once.
//
// Every change is saved from the event that made it, not from a later render, so closing the popup right after typing
// or pressing Clear still keeps the newest text. Restoring the saved message never overwrites text the user has
// already typed: the saved text is put first, followed by what was typed while the restore was running. A failed
// restore never writes anything back, so it cannot erase the saved message.
export function useComposer({ observation, actions = DEFAULT_ACTIONS, storage = DEFAULT_STORAGE } = {}) {
  const [text, setTextState] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [speaking, setSpeaking] = useState(false);
  const textRef = useRef('');
  const restoring = useRef(true);
  const edited = useRef(false);
  const unavailableShown = useRef(false);
  const accumulator = useRef(initialAccumulatorState());

  // A missing storage API is explained once, and never over feedback the user is already reading. A failed save is
  // reported every time, because the user needs to know their text was not kept.
  const reportSave = (result) => {
    if (result?.ok !== false) return;
    if (result.reason === 'unavailable') {
      if (unavailableShown.current) return;
      unavailableShown.current = true;
      setFeedback((previous) => previous ?? UNAVAILABLE_MESSAGE);
      return;
    }
    setFeedback(SAVE_FAILED_MESSAGE);
  };

  // Updates the message and saves it at once. Saving waits only while the restore is still running.
  const apply = (next) => {
    edited.current = true;
    textRef.current = next;
    setTextState(next);
    if (!restoring.current) {
      Promise.resolve(storage.save(next)).then(reportSave);
    }
  };

  useEffect(() => {
    let cancelled = false;
    Promise.resolve(storage.load()).then((result) => {
      if (cancelled) return;
      restoring.current = false;
      if (!result.ok) {
        const warning = result.reason === 'unavailable' ? UNAVAILABLE_MESSAGE : RESTORE_FAILED_MESSAGE;
        setFeedback((previous) => previous ?? warning);
        if (edited.current) Promise.resolve(storage.save(textRef.current)).then(reportSave);
        return;
      }
      if (edited.current) {
        const merged = `${result.text}${textRef.current}`;
        textRef.current = merged;
        setTextState(merged);
        Promise.resolve(storage.save(merged)).then(reportSave);
      } else if (result.text) {
        textRef.current = result.text;
        setTextState(result.text);
      }
    });
    return () => {
      cancelled = true;
    };
    // The storage object is created once at module level, or by the caller, and does not change between renders.
  }, [storage]);

  useEffect(() => {
    const next = observeLetter(accumulator.current, {
      letter: observation?.letter ?? null,
      sequence: observation?.sequence ?? null,
      now: Date.now(),
    });
    accumulator.current = next.state;
    if (next.commit) {
      apply(appendLetter(textRef.current, next.commit));
      setFeedback({ tone: 'info', message: `Added ${next.commit}.` });
    }
    // Only a new letter or a new frame can add text, so the observation's fields are the dependencies.
  }, [observation?.letter, observation?.sequence]);

  useEffect(() => () => actions.stopSpeaking(), [actions]);

  const setText = (value) => apply(value);
  const addSpace = () => apply(appendSpace(textRef.current));
  const backspace = () => apply(removeLastCharacter(textRef.current));
  const clear = () => {
    apply('');
    setFeedback({ tone: 'info', message: 'Message cleared.' });
  };

  const copy = async () => {
    const current = textRef.current;
    if (!current) return setFeedback({ tone: 'error', message: 'There is no text to copy yet.' });
    const result = await actions.copyText(current);
    if (result.ok) return setFeedback({ tone: 'success', message: 'Copied to the clipboard.' });
    if (result.reason === 'unsupported') {
      return setFeedback({ tone: 'error', message: 'Copying is not available in this browser.' });
    }
    return setFeedback({ tone: 'error', message: 'Copy failed. Select the text and copy it manually.' });
  };

  const speak = () => {
    const current = textRef.current;
    if (!current) return setFeedback({ tone: 'error', message: 'There is no text to speak yet.' });
    const result = actions.speakText(current);
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
    const result = await actions.insertTextIntoActiveTab(textRef.current);
    setFeedback(describeInsertion(result));
  };

  return {
    text, setText, feedback, speaking,
    addSpace, backspace, clear, copy, speak, stop, insert,
  };
}
