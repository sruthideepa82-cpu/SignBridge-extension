import { useCallback, useEffect, useRef, useState } from 'react';
import { isActivePhase, MSG, TARGET } from '../lib/meeting/messages.js';

const EMPTY_SNAPSHOT = Object.freeze({
  phase: 'idle',
  error: null,
  tabId: null,
  tabTitle: '',
  tabUrl: '',
  startedAt: null,
  droppedFrames: 0,
  captions: { interim: '', finals: [] },
});

function normalise(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return EMPTY_SNAPSHOT;
  return {
    ...EMPTY_SNAPSHOT,
    ...snapshot,
    captions: {
      interim: typeof snapshot.captions?.interim === 'string' ? snapshot.captions.interim : '',
      finals: Array.isArray(snapshot.captions?.finals) ? snapshot.captions.finals : [],
    },
  };
}

// The captions window is a renderer. The offscreen document owns the session and transcript; this hook mirrors them.
export function useCaptionsSession({ chromeApi = globalThis.chrome } = {}) {
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const activeRef = useRef(false);
  activeRef.current = isActivePhase(snapshot.phase);

  const send = useCallback((target, type, payload = {}) => {
    if (!chromeApi?.runtime?.sendMessage) return Promise.resolve(null);
    return chromeApi.runtime.sendMessage({ target, type, ...payload }).catch(() => null);
  }, [chromeApi]);

  useEffect(() => {
    let cancelled = false;
    let sawLiveMessage = false;
    if (!chromeApi?.runtime?.onMessage?.addListener) return undefined;

    const listener = (message) => {
      if (!message || message.target !== TARGET.CAPTIONS) return;
      sawLiveMessage = true;
      if (message.type === MSG.SESSION_STATE && message.snapshot) {
        setSnapshot((current) => {
          const next = normalise(message.snapshot);
          // A lifecycle message without captions must not erase a transcript the offscreen document still holds.
          // A new session begins with phase "starting" and must start from an empty transcript.
          const keepCaptions = next.phase !== 'starting'
            && !next.captions.finals.length
            && !next.captions.interim
            && current.captions.finals.length > 0;
          return keepCaptions ? { ...next, captions: current.captions } : next;
        });
      }
      if (message.type === MSG.CAPTIONS_UPDATE && message.captions) {
        setSnapshot((current) => ({
          ...current,
          captions: {
            interim: typeof message.captions.interim === 'string' ? message.captions.interim : '',
            finals: Array.isArray(message.captions.finals) ? message.captions.finals : [],
          },
        }));
      }
      if (message.type === MSG.SESSION_ERROR && message.error) {
        setSnapshot((current) => ({ ...current, phase: 'error', error: message.error }));
      }
    };

    chromeApi.runtime.onMessage.addListener(listener);

    send(TARGET.OFFSCREEN, MSG.SESSION_SNAPSHOT).then((response) => {
      if (!cancelled && !sawLiveMessage && response?.snapshot) setSnapshot(normalise(response.snapshot));
    });

    if (chromeApi.windows?.getCurrent) {
      chromeApi.windows.getCurrent()
        .then((window) => send(TARGET.BACKGROUND, MSG.CAPTIONS_READY, { windowId: window?.id ?? null }))
        .catch(() => {});
    }

    const onPageHide = () => {
      if (!activeRef.current) return;
      // Best effort. The service worker also stops capture when this window is removed.
      send(TARGET.BACKGROUND, MSG.MEETING_STOP, { reason: 'captions_window_closed' });
      send(TARGET.OFFSCREEN, MSG.CAPTURE_STOP, { reason: 'captions_window_closed' });
    };
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onPageHide);

    return () => {
      cancelled = true;
      chromeApi.runtime.onMessage.removeListener(listener);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onPageHide);
    };
  }, [chromeApi, send]);

  const stop = useCallback(async () => {
    setSnapshot((current) => ({ ...current, phase: 'stopping' }));
    await send(TARGET.OFFSCREEN, MSG.CAPTURE_STOP, { reason: 'user' });
    await send(TARGET.BACKGROUND, MSG.MEETING_STOP, { reason: 'user' });
  }, [send]);

  const clear = useCallback(() => {
    send(TARGET.OFFSCREEN, MSG.CAPTIONS_CLEAR);
  }, [send]);

  const closeWindow = useCallback(() => {
    window.close();
  }, []);

  return { snapshot, stop, clear, closeWindow };
}
