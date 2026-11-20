import { useEffect, useState } from 'react';
import { cameraStreamUrl } from '../lib/apiClient.js';

// Shows the backend's live stream. The backend owns the webcam, so this image only reads frames from the camera
// session that recognition already started. The image exists only while recognition runs, so closing the popup or
// stopping recognition closes the connection without starting or stopping anything.
export default function CameraPreview({ active, offline }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [active, offline]);

  if (!active) {
    return (
      <div className="preview" data-state="off">
        <p className="preview-note">The live preview appears here while recognition is running.</p>
      </div>
    );
  }

  if (offline) {
    return (
      <div className="preview" data-state="offline">
        <p className="preview-note" role="status">SignBridge is not reachable, so the preview is paused.</p>
      </div>
    );
  }

  if (failed) {
    return (
      <>
        <div className="preview" data-state="error">
          <p className="preview-note" role="alert">
            The live preview could not be shown. The webcam may be in use by another application.
          </p>
        </div>
        <div className="controls">
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setAttempt((count) => count + 1);
              setLoaded(false);
              setFailed(false);
            }}
          >
            Retry preview
          </button>
        </div>
      </>
    );
  }

  return (
    <div className="preview" data-state={loaded ? 'live' : 'loading'}>
      <img
        key={attempt}
        src={cameraStreamUrl(attempt)}
        alt="Live webcam preview"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
      {!loaded && <p className="preview-note" role="status">Starting the live preview…</p>}
    </div>
  );
}
