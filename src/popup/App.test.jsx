import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.jsx';

const cameraOff = { running: false, camera_index: 0, width: 640, height: 480, fps: 30, last_error: null };
const cameraOn = { ...cameraOff, running: true };
const recognized = (label, confidence = 0.88) => ({
  status: 'recognized', label, confidence, threshold: 0.7, frame_sequence: 5, experimental: true,
  verification: 'unverified_dataset',
});

function jsonResponse(body, status = 200) {
  return { ok: status < 300, status, json: async () => body };
}

// Routes each backend path to a handler, so each test controls the backend it sees.
function fakeBackend(routes) {
  return vi.fn(async (url) => {
    const path = new URL(url).pathname.replace('/api', '');
    const handler = routes[path];
    if (!handler) return jsonResponse({ error: { code: 'http_404', message: 'nope' } }, 404);
    return handler();
  });
}

describe('SignBridge popup', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the experimental label and the not-a-translation notice', async () => {
    vi.stubGlobal('fetch', fakeBackend({ '/camera/status': () => jsonResponse(cameraOff) }));
    render(<App />);
    expect(screen.getByRole('note')).toHaveTextContent(/Experimental: unverified dataset/);
    expect(screen.getByText(/Not a verified ISL translation/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Camera off')).toBeInTheDocument());
  });

  it('reports when the backend is not reachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));
    render(<App />);
    expect(await screen.findByText('SignBridge not reachable')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/not running/i);
  });

  it('starts recognition through the backend and shows the camera as on', async () => {
    const fetchMock = fakeBackend({
      '/camera/status': () => jsonResponse(cameraOff),
      '/camera/start': () => jsonResponse(cameraOn),
      '/recognition/latest': () => jsonResponse({ status: 'no_hand', threshold: 0.7, frame_sequence: 1, experimental: true }),
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start recognition' }));

    expect(await screen.findByText('Camera on')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/camera/start',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(await screen.findByText('Show one hand')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start recognition' })).toBeDisabled();
  });

  it('shows a recognized letter only when the backend reports recognized', async () => {
    vi.stubGlobal('fetch', fakeBackend({
      '/camera/status': () => jsonResponse(cameraOn),
      '/recognition/latest': () => jsonResponse(recognized('K')),
    }));
    render(<App />);
    await waitFor(() => expect(document.querySelector('.letter')).toHaveTextContent('K'));
    expect(screen.getByText(/Confidence 88%/)).toBeInTheDocument();
  });

  it('does not show a letter for an uncertain prediction', async () => {
    vi.stubGlobal('fetch', fakeBackend({
      '/camera/status': () => jsonResponse(cameraOn),
      '/recognition/latest': () => jsonResponse({
        status: 'uncertain', label: 'M', confidence: 0.35, threshold: 0.7, frame_sequence: 2, experimental: true,
      }),
    }));
    render(<App />);
    expect(await screen.findByText('Not sure yet')).toBeInTheDocument();
    expect(screen.queryByText('M')).not.toBeInTheDocument();
  });

  it('stops recognition through the backend and clears the letter', async () => {
    const fetchMock = fakeBackend({
      '/camera/status': () => jsonResponse(cameraOn),
      '/camera/stop': () => jsonResponse(cameraOff),
      '/recognition/latest': () => jsonResponse(recognized('T')),
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    await waitFor(() => expect(document.querySelector('.letter')).toHaveTextContent('T'));

    fireEvent.click(screen.getByRole('button', { name: 'Stop recognition' }));
    expect(await screen.findByText('Camera off')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/camera/stop',
      expect.objectContaining({ method: 'POST' }),
    );
    await waitFor(() => expect(document.querySelector('.letter')).not.toHaveTextContent('T'));
  });

  it('explains when the webcam cannot be opened', async () => {
    vi.stubGlobal('fetch', fakeBackend({
      '/camera/status': () => jsonResponse(cameraOff),
      '/camera/start': () => jsonResponse({
        error: { code: 'camera_unavailable', message: 'Camera 0 is in use by another application.' },
      }, 503),
    }));
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start recognition' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/webcam could not be opened/i);
    expect(screen.getByText('Camera off')).toBeInTheDocument();
  });

  it('keeps Stop available for a running camera so the user can always turn it off', async () => {
    vi.stubGlobal('fetch', fakeBackend({
      '/camera/status': () => jsonResponse(cameraOn),
      '/recognition/latest': () => jsonResponse({ status: 'no_hand', threshold: 0.7, frame_sequence: 1, experimental: true }),
    }));
    render(<App />);
    expect(await screen.findByText('Camera on')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stop recognition' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Start recognition' })).toBeDisabled();
  });
});
