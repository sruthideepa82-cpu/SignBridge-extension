import { useEffect, useState } from 'react';
import { cameraStreamUrl } from '../lib/apiClient.js';
import { CameraIcon, RefreshIcon } from '../ui/icons.jsx';

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
        <div className="preview-empty">
          <span className="preview-orb" aria-hidden="true"><CameraIcon size={24} /></span>
          <p className="preview-title">Camera preview</p>
          <p className="preview-note">The live preview appears here while recognition is running.</p>
        </div>
      </div>
    );
  }

  if (offline) {
    return (
      <div className="preview" data-state="offline">
        <div className="preview-empty">
          <span className="preview-orb" aria-hidden="true"><CameraIcon size={24} /></span>
          <p className="preview-title">Preview paused</p>
          <p className="preview-note" role="status">SignBridge is not reachable, so the preview is paused.</p>
        </div>
      </div>
    );
  }

  if (failed) {
    return (
      <div className="preview" data-state="error">
        <div className="preview-empty">
          <span className="preview-orb error" aria-hidden="true"><CameraIcon size={24} /></span>
          <p className="preview-title">Preview unavailable</p>
          <p className="preview-note" role="alert">
            The live preview could not be shown. The webcam may be in use by another application.
          </p>
          <button
            type="button"
            className="button secondary small"
            onClick={() => {
              setAttempt((count) => count + 1);
              setLoaded(false);
              setFailed(false);
            }}
          >
            <RefreshIcon size={14} />
            Retry preview
          </button>
        </div>
      </div>
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
      {!loaded && (
        <div className="preview-loading" role="status">
          <span className="preview-spinner" aria-hidden="true" />
          <p className="preview-note">Starting the live preview…</p>
        </div>
      )}
      <div className="preview-vignette" aria-hidden="true" />
    </div>
  );
}
