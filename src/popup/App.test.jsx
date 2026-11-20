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

  it('shows the confidence bar, threshold and experimental warning with a recognized letter', async () => {
    vi.stubGlobal('fetch', fakeBackend({
      '/camera/status': () => jsonResponse(cameraOn),
      '/recognition/latest': () => jsonResponse(recognized('K', 0.88)),
    }));
    render(<App />);
    const bar = await screen.findByRole('progressbar', { name: 'Recognition confidence' });
    await waitFor(() => expect(bar).toHaveAttribute('aria-valuenow', '88'));
    expect(screen.getByText('Threshold 70%')).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('Experimental: unverified dataset');
  });

  it('shows the supported-letters footer and the local backend address', async () => {
    vi.stubGlobal('fetch', fakeBackend({ '/camera/status': () => jsonResponse(cameraOff) }));
    render(<App />);
    expect(screen.getByText(/recognises supported fingerspelled letters only/)).toBeInTheDocument();
    expect(screen.getByText('http://127.0.0.1:8000')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Camera off')).toBeInTheDocument());
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

  it('shows the live preview from the running camera without starting a camera session', async () => {
    const fetchMock = fakeBackend({
      '/camera/status': () => jsonResponse(cameraOn),
      '/recognition/latest': () => jsonResponse({ status: 'no_hand', threshold: 0.7, frame_sequence: 1, experimental: true }),
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    expect(await screen.findByRole('img', { name: 'Live webcam preview' }))
      .toHaveAttribute('src', 'http://127.0.0.1:8000/api/camera/stream?attempt=0');
    expect(fetchMock.mock.calls.map(([url]) => url)).not.toContain('http://127.0.0.1:8000/api/camera/stream?attempt=0');
    expect(fetchMock.mock.calls.map(([url]) => url)).not.toContainEqual(expect.stringContaining('/camera/start'));
  });

  it('removes the live preview when recognition is stopped', async () => {
    vi.stubGlobal('fetch', fakeBackend({
      '/camera/status': () => jsonResponse(cameraOn),
      '/camera/stop': () => jsonResponse(cameraOff),
      '/recognition/latest': () => jsonResponse({ status: 'no_hand', threshold: 0.7, frame_sequence: 1, experimental: true }),
    }));
    render(<App />);
    expect(await screen.findByRole('img', { name: 'Live webcam preview' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Stop recognition' }));
    expect(await screen.findByText('Camera off')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Live webcam preview' })).not.toBeInTheDocument();
    expect(screen.getByText(/appears here while recognition is running/)).toBeInTheDocument();
  });

  it('does not start or stop the camera when the popup is closed or reopened', async () => {
    const fetchMock = fakeBackend({
      '/camera/status': () => jsonResponse(cameraOn),
      '/recognition/latest': () => jsonResponse({ status: 'no_hand', threshold: 0.7, frame_sequence: 1, experimental: true }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const first = render(<App />);
    expect(await screen.findByRole('img', { name: 'Live webcam preview' })).toBeInTheDocument();
    first.unmount();

    render(<App />);
    expect(await screen.findByRole('img', { name: 'Live webcam preview' })).toBeInTheDocument();
    const paths = fetchMock.mock.calls.map(([url]) => new URL(url).pathname);
    expect(paths).not.toContain('/api/camera/start');
    expect(paths).not.toContain('/api/camera/stop');
  });

  it('renders the message composer with its actions disabled until there is text', async () => {
    vi.stubGlobal('fetch', fakeBackend({ '/camera/status': () => jsonResponse(cameraOff) }));
    render(<App />);
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Insert into page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Speak' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Stop speaking' })).toBeDisabled();
    await waitFor(() => expect(screen.getByText('Camera off')).toBeInTheDocument());
  });

  it('adds a stable recognised letter to the message from the live backend results', async () => {
    let sequence = 0;
    vi.stubGlobal('fetch', fakeBackend({
      '/camera/status': () => jsonResponse(cameraOn),
      '/recognition/latest': () => {
        sequence += 1;
        return jsonResponse({ ...recognized('R'), frame_sequence: sequence });
      },
    }));
    render(<App />);
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('R'), { timeout: 5000 });
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
