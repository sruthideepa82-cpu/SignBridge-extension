import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MeetPanel from './MeetPanel.jsx';

function fakeChrome({ startResponse = { ok: true }, active = false, tab, sendImpl } = {}) {
  const sendMessage = vi.fn(async (message) => {
    if (sendImpl) return sendImpl(message);
    if (message.type === 'meeting.status') return { ok: true, active };
    if (message.type === 'meeting.start') return startResponse;
    if (message.type === 'meeting.stop') return { ok: true };
    if (message.type === 'meeting.diagnostics') return { ok: true, lastStartup: null };
    return { ok: true };
  });
  return {
    chromeApi: {
      tabs: {
        query: vi.fn().mockResolvedValue([tab ?? {
          id: 42,
          title: 'Weekly team call',
          url: 'https://meet.google.com/abc-defg-hij',
        }]),
      },
      runtime: { sendMessage },
    },
    sendMessage,
  };
}

describe('meeting captions popup panel', () => {
  it('shows the active tab and requires explicit consent before starting', async () => {
    const { chromeApi, sendMessage } = fakeChrome();
    render(<MeetPanel chromeApi={chromeApi} />);

    expect(await screen.findByText('Weekly team call')).toBeInTheDocument();
    const start = screen.getByRole('button', { name: 'Start browser captions' });
    expect(start).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox'));
    expect(start).toBeEnabled();
    fireEvent.click(start);

    await waitFor(() => expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      target: 'background',
      type: 'meeting.start',
      tabId: 42,
      tabTitle: 'Weekly team call',
      tabUrl: 'https://meet.google.com/abc-defg-hij',
    })));
    expect(await screen.findByText(/Captions are starting/)).toBeInTheDocument();
  });

  it('presents the feature as universal browser-tab captioning, not a platform-specific one', async () => {
    const { chromeApi } = fakeChrome({ tab: { id: 7, title: 'Local test', url: 'http://localhost:9099/' } });
    render(<MeetPanel chromeApi={chromeApi} />);
    expect(await screen.findByText(/meeting-platform compatibility has not been verified/i)).toBeInTheDocument();
    expect(screen.getByText('Live Communication')).toBeInTheDocument();
    expect(screen.getByText('localhost:9099')).toBeInTheDocument();
    expect(screen.queryByText(/This tab is not Google Meet/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'Start browser captions' })).toBeEnabled();
  });

  it('shows a plain-language error when the backend is down', async () => {
    const { chromeApi } = fakeChrome({ startResponse: { ok: false, reason: 'backend_down' } });
    render(<MeetPanel chromeApi={chromeApi} />);
    await screen.findByText('Weekly team call');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Start browser captions' }));
    expect(await screen.findByText(/backend is not running/i)).toBeInTheDocument();
  });

  it('retries once when the worker misses the first wake-up', async () => {
    let attempts = 0;
    const { chromeApi } = fakeChrome({
      sendImpl: async (message) => {
        if (message.type === 'meeting.start') {
          attempts += 1;
          if (attempts === 1) throw new Error('Receiving end does not exist');
          return { ok: true };
        }
        return { ok: true, active: false };
      },
    });
    render(<MeetPanel chromeApi={chromeApi} />);
    await screen.findByText('Weekly team call');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Start browser captions' }));
    expect(await screen.findByText(/Captions are starting/)).toBeInTheDocument();
    expect(attempts).toBe(2);
  });

  it('treats an already-running session as success and does not create another capture', async () => {
    const { chromeApi } = fakeChrome({ startResponse: { ok: true, alreadyRunning: true } });
    render(<MeetPanel chromeApi={chromeApi} />);
    await screen.findByText('Weekly team call');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Start browser captions' }));
    expect(await screen.findByText(/already running/i)).toBeInTheDocument();
  });

  it('explains a dead background worker instead of showing the old generic error', async () => {
    const { chromeApi } = fakeChrome({
      sendImpl: async (message) => {
        if (message.type === 'meeting.start') {
          throw new Error('Could not establish connection. Receiving end does not exist.');
        }
        if (message.type === 'meeting.diagnostics') {
          return { ok: true, lastStartup: { stage: 'stream_id', reason: 'stream_id_failed' } };
        }
        return { ok: true, active: false };
      },
    });
    render(<MeetPanel chromeApi={chromeApi} />);
    await screen.findByText('Weekly team call');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Start browser captions' }));
    const alert = await screen.findByText(/background worker is not running/i);
    expect(alert).toHaveTextContent(/Receiving end does not exist/);
    expect(alert).toHaveTextContent(/stream_id/);
    expect(screen.queryByText(/The captions window did not start/)).not.toBeInTheDocument();
  });

  it('explains an undefined response and a window creation failure', async () => {
    const { chromeApi } = fakeChrome({ startResponse: null });
    const { unmount } = render(<MeetPanel chromeApi={chromeApi} />);
    await screen.findByText('Weekly team call');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Start browser captions' }));
    expect(await screen.findByText(/returned no answer/i)).toBeInTheDocument();
    unmount();

    const second = fakeChrome({
      startResponse: {
        ok: false,
        reason: 'window_create_failed',
        stage: 'captions_window',
        detail: 'INJECTED: window create failed',
      },
    });
    render(<MeetPanel chromeApi={second.chromeApi} />);
    await screen.findByText('Weekly team call');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Start browser captions' }));
    const message = await screen.findByText(/could not open the captions window/i);
    expect(message).toHaveTextContent(/INJECTED: window create failed/);
  });

  it('shows a running session and can stop it', async () => {
    const { chromeApi, sendMessage } = fakeChrome({ active: true });
    render(<MeetPanel chromeApi={chromeApi} />);
    expect(await screen.findByText('Capturing audio from this tab')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Stop capture' }));
    await waitFor(() => expect(sendMessage).toHaveBeenCalledWith({ target: 'background', type: 'meeting.stop', reason: 'user' }));
  });

  it('explains when the extension APIs are unavailable', async () => {
    render(<MeetPanel chromeApi={undefined} />);
    expect(await screen.findByText(/installed SignBridge extension/)).toBeInTheDocument();
  });
});
