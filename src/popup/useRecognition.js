import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getCameraStatus,
  getLatestRecognition,
  startCamera,
  stopCamera,
} from '../lib/apiClient.js';
import { POLL_INTERVAL_MS } from '../lib/config.js';
import { interpretRecognition } from '../lib/recognition.js';

const DEFAULT_API = {
  getCameraStatus,
  getLatestRecognition,
  startCamera,
  stopCamera,
};

// Owns the popup's connection to the backend. The backend owns the webcam, so this hook only asks it to start or stop
// and reads the newest recognition result while the camera is running.
export function useRecognition({ api = DEFAULT_API, pollIntervalMs = POLL_INTERVAL_MS } = {}) {
  const [connection, setConnection] = useState('checking');
  const [cameraRunning, setCameraRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  // A poll that was already in flight when the user pressed Stop must not put a letter back on screen.
  const runningRef = useRef(false);

  useEffect(() => {
    runningRef.current = cameraRunning;
  }, [cameraRunning]);

  useEffect(() => {
    let cancelled = false;
    api.getCameraStatus()
      .then((status) => {
        if (cancelled) return;
        setConnection('online');
        runningRef.current = status.running === true;
        setCameraRunning(status.running === true);
      })
      .catch((err) => {
        if (cancelled) return;
        setConnection(err.code === 'backend_unreachable' ? 'offline' : 'online');
        setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  useEffect(() => {
    if (!cameraRunning) return undefined;
    let cancelled = false;
    let timer = null;

    const poll = async () => {
      try {
        const response = await api.getLatestRecognition();
        if (cancelled || !runningRef.current) return;
        setConnection('online');
        setError(null);
        setResult({ ...interpretRecognition(response), sequence: response.frame_sequence ?? null });
      } catch (err) {
        if (cancelled) return;
        setConnection(err.code === 'backend_unreachable' ? 'offline' : 'online');
        setError(err.message);
        setResult(null);
        if (err.code === 'camera_not_running') setCameraRunning(false);
      }
      if (!cancelled) timer = setTimeout(poll, pollIntervalMs);
    };

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [cameraRunning, api, pollIntervalMs]);

  const start = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const status = await api.startCamera();
      setConnection('online');
      runningRef.current = status.running === true;
      setCameraRunning(status.running === true);
      if (status.running !== true) {
        setError(status.last_error || 'The camera did not start. Check the backend console.');
      }
    } catch (err) {
      setConnection(err.code === 'backend_unreachable' ? 'offline' : 'online');
      setCameraRunning(false);
      runningRef.current = false;
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [api]);

  const stop = useCallback(async () => {
    setBusy(true);
    setError(null);
    runningRef.current = false;
    try {
      await api.stopCamera();
      setCameraRunning(false);
      setResult(null);
    } catch (err) {
      setConnection(err.code === 'backend_unreachable' ? 'offline' : 'online');
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [api]);

  return { connection, cameraRunning, busy, error, result, start, stop };
}
