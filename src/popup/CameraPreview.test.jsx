import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { API_BASE } from '../lib/config.js';
import CameraPreview from './CameraPreview.jsx';

const streamUrl = (attempt = 0) => `${API_BASE}/camera/stream?attempt=${attempt}`;

describe('CameraPreview', () => {
  it('opens no stream while the camera is off', () => {
    const { container } = render(<CameraPreview active={false} offline={false} />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText(/appears here while recognition is running/)).toBeInTheDocument();
  });

  it('shows a loading note and the local backend stream while the first frame is pending', () => {
    render(<CameraPreview active offline={false} />);
    const image = screen.getByRole('img', { name: 'Live webcam preview' });
    expect(image).toHaveAttribute('src', streamUrl(0));
    expect(image.getAttribute('src').startsWith('http://127.0.0.1:8000/')).toBe(true);
    expect(screen.getByText('Starting the live preview…')).toBeInTheDocument();
    expect(document.querySelector('.preview')).toHaveAttribute('data-state', 'loading');
  });

  it('hides the loading note once the first frame has loaded', () => {
    render(<CameraPreview active offline={false} />);
    fireEvent.load(screen.getByRole('img', { name: 'Live webcam preview' }));
    expect(screen.queryByText('Starting the live preview…')).not.toBeInTheDocument();
    expect(document.querySelector('.preview')).toHaveAttribute('data-state', 'live');
  });

  it('explains a failed stream and retries with a fresh connection', () => {
    render(<CameraPreview active offline={false} />);
    fireEvent.error(screen.getByRole('img', { name: 'Live webcam preview' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/could not be shown/);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry preview' }));
    expect(screen.getByRole('img', { name: 'Live webcam preview' })).toHaveAttribute('src', streamUrl(1));
  });

  it('shows that the backend is not reachable and opens no stream', () => {
    const { container } = render(<CameraPreview active offline />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText(/SignBridge is not reachable, so the preview is paused/)).toBeInTheDocument();
  });

  it('closes the stream when the popup unmounts', () => {
    const { container, unmount } = render(<CameraPreview active offline={false} />);
    expect(container.querySelector('img')).not.toBeNull();
    unmount();
    expect(document.querySelector('img')).toBeNull();
  });

  it('removes the stream as soon as the camera is reported off', () => {
    const { container, rerender } = render(<CameraPreview active offline={false} />);
    fireEvent.load(screen.getByRole('img', { name: 'Live webcam preview' }));
    rerender(<CameraPreview active={false} offline={false} />);
    expect(container.querySelector('img')).toBeNull();
    expect(document.querySelector('.preview')).toHaveAttribute('data-state', 'off');
  });
});
