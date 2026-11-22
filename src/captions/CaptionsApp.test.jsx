import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CaptionsApp from './CaptionsApp.jsx';

function fakeChrome(snapshot) {
  let listener = null;
  const sendMessage = vi.fn(async (message) => {
    if (message.type === 'session.snapshot') return { ok: true, snapshot };
    return { ok: true };
  });
  const chromeApi = {
    runtime: {
      sendMessage,
      onMessage: {
        addListener: (fn) => { listener = fn; },
        removeListener: vi.fn(),
      },
    },
    windows: { getCurrent: vi.fn().mockResolvedValue({ id: 9 }) },
  };
  return { chromeApi, sendMessage, emit: (message) => listener?.(message) };
}

const listening = {
  phase: 'listening',
  error: null,
  tabId: 42,
  tabTitle: 'Weekly team call',
  tabUrl: 'https://meet.google.com/abc-defg-hij',
  startedAt: 1,
  droppedFrames: 0,
  captions: {
    interim: '…and then we',
    finals: [
      { seq: 1, text: 'Good morning everyone.', at: 10 },
      { seq: 2, text: 'Can you hear me?', at: 11 },
    ],
  },
};

describe('captions window', () => {
  it('shows the persistent capture banner and the confirmed and interim text', async () => {
    const { chromeApi } = fakeChrome(listening);
    render(<CaptionsApp chromeApi={chromeApi} />);

    expect(await screen.findByText(/Good morning everyone\./)).toBeInTheDocument();
    expect(screen.getByText(/Can you hear me\?/)).toBeInTheDocument();
    expect(screen.getByText(/and then we/)).toBeInTheDocument();
    expect(screen.getByText('Captions on')).toBeInTheDocument();
    expect(screen.getByText(/Nothing is recorded or saved/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stop captions' })).toBeEnabled();
  });

  it('stops through both the offscreen document and the service worker', async () => {
    const { chromeApi, sendMessage } = fakeChrome(listening);
    render(<CaptionsApp chromeApi={chromeApi} />);
    await screen.findByText(/Good morning/);
    fireEvent.click(screen.getByRole('button', { name: 'Stop captions' }));
    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({ target: 'offscreen', type: 'capture.stop', reason: 'user' });
      expect(sendMessage).toHaveBeenCalledWith({ target: 'background', type: 'meeting.stop', reason: 'user' });
    });
  });

  it('clears only the visible transcript', async () => {
    const { chromeApi, sendMessage } = fakeChrome(listening);
    render(<CaptionsApp chromeApi={chromeApi} />);
    await screen.findByText(/Good morning/);
    fireEvent.click(screen.getByRole('button', { name: 'Clear text' }));
    expect(sendMessage).toHaveBeenCalledWith({ target: 'offscreen', type: 'captions.clear' });
  });

  it('renders live updates without a reload', async () => {
    const { chromeApi, emit } = fakeChrome({ ...listening, captions: { interim: '', finals: [] } });
    render(<CaptionsApp chromeApi={chromeApi} />);
    emit({
      target: 'captions',
      type: 'captions.update',
      captions: { interim: 'next sentence', finals: [{ seq: 3, text: 'The build passes.', at: 12 }] },
    });
    expect(await screen.findByText('The build passes.')).toBeInTheDocument();
    expect(screen.getByText('next sentence')).toBeInTheDocument();
  });

  it('clears the previous transcript when a new session starts', async () => {
    const { chromeApi, emit } = fakeChrome(listening);
    render(<CaptionsApp chromeApi={chromeApi} />);
    await screen.findByText(/Good morning/);
    emit({
      target: 'captions',
      type: 'session.state',
      snapshot: { ...listening, phase: 'starting', startedAt: 99, captions: { interim: '', finals: [] } },
    });
    await waitFor(() => expect(screen.queryByText(/Good morning/)).not.toBeInTheDocument());
    expect(screen.getByText('Starting captions')).toBeInTheDocument();
  });

  it('shows a specific connection error and the stopped banner', async () => {
    const { chromeApi } = fakeChrome({
      ...listening,
      phase: 'error',
      captions: { interim: '', finals: [] },
      error: { code: 'origin_rejected', message: 'Add the extension origin to SIGNBRIDGE_CORS_ORIGINS.' },
    });
    render(<CaptionsApp chromeApi={chromeApi} />);
    expect(await screen.findByText(/Add the extension origin/)).toBeInTheDocument();
    expect(screen.getByText('Captions are off')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stop captions' })).toBeDisabled();
  });

  it('offers a larger-text mode', async () => {
    const { chromeApi } = fakeChrome(listening);
    render(<CaptionsApp chromeApi={chromeApi} />);
    const button = await screen.findByRole('button', { name: 'Larger text' });
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveTextContent('Normal text');
  });
});
