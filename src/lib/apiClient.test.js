import { describe, expect, it, vi } from 'vitest';
import {
  ApiError, apiRequest, cameraStreamUrl, getCameraStatus, getLatestRecognition, startCamera, stopCamera,
} from './apiClient.js';
import { API_BASE, CAMERA_CONTROL_TIMEOUT_MS } from './config.js';

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe('camera control timeouts', () => {
  it('lets a slow camera start finish instead of reporting the backend as unreachable', async () => {
    vi.useFakeTimers();
    try {
      let aborted = false;
      const fetchImpl = vi.fn((_url, { signal }) => new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => {
          aborted = true;
          const abort = new Error('aborted');
          abort.name = 'AbortError';
          reject(abort);
        });
        setTimeout(() => resolve(jsonResponse({ running: true })), 8000);
      }));
      const pending = startCamera({ fetchImpl });
      await vi.advanceTimersByTimeAsync(7000);
      expect(aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1500);
      await expect(pending).resolves.toEqual({ running: true });
    } finally {
      vi.useRealTimers();
    }
  });

  it('still gives up on a camera start that never answers', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          const abort = new Error('aborted');
          abort.name = 'AbortError';
          reject(abort);
        });
      }));
      const pending = startCamera({ fetchImpl }).catch((e) => e);
      await vi.advanceTimersByTimeAsync(CAMERA_CONTROL_TIMEOUT_MS + 1);
      const error = await pending;
      expect(error.code).toBe('backend_unreachable');
      expect(error.message).toMatch(/did not answer/i);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('cameraStreamUrl', () => {
  it('points at the existing backend MJPEG stream on the local backend only', () => {
    expect(cameraStreamUrl(0)).toBe(`${API_BASE}/camera/stream?attempt=0`);
    expect(cameraStreamUrl(0)).toMatch(/^http:\/\/127\.0\.0\.1:8000\/api\/camera\/stream\?/);
  });

  it('changes with the attempt number so a retry opens a fresh connection', () => {
    expect(cameraStreamUrl(2)).not.toBe(cameraStreamUrl(1));
  });
});

describe('apiRequest', () => {
  it('calls the documented backend address with the expected method', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ running: false }));
    await getCameraStatus({ fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith(
      `${API_BASE}/camera/status`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('uses POST for start and stop', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ running: true }));
    await startCamera({ fetchImpl });
    await stopCamera({ fetchImpl });
    expect(fetchImpl.mock.calls[0][0]).toBe(`${API_BASE}/camera/start`);
    expect(fetchImpl.mock.calls[0][1].method).toBe('POST');
    expect(fetchImpl.mock.calls[1][0]).toBe(`${API_BASE}/camera/stop`);
    expect(fetchImpl.mock.calls[1][1].method).toBe('POST');
  });

  it('returns the parsed body for a successful response', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ status: 'camera_off', threshold: 0.7 }));
    await expect(getLatestRecognition({ fetchImpl })).resolves.toEqual({ status: 'camera_off', threshold: 0.7 });
  });

  it('reports a backend that is not running as backend_unreachable', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const error = await getCameraStatus({ fetchImpl }).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('backend_unreachable');
    expect(error.message).toMatch(/not running/i);
    expect(error.message).toContain('127.0.0.1:8000');
  });

  it('reports a request that gets no answer in time as a timeout', async () => {
    const fetchImpl = vi.fn(async (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        const abort = new Error('aborted');
        abort.name = 'AbortError';
        reject(abort);
      });
    }));
    const error = await apiRequest('/camera/status', { fetchImpl, timeoutMs: 5 }).catch((e) => e);
    expect(error.code).toBe('backend_unreachable');
    expect(error.message).toMatch(/did not answer/i);
  });

  it('keeps the backend error code and explains camera_unavailable in plain language', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(
      { error: { code: 'camera_unavailable', message: 'Camera busy' } },
      503,
    ));
    const error = await startCamera({ fetchImpl }).catch((e) => e);
    expect(error.status).toBe(503);
    expect(error.code).toBe('camera_unavailable');
    expect(error.message).toMatch(/could not be opened/i);
  });

  it('shows the backend message for an error code the popup does not know', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(
      { error: { code: 'something_new', message: 'Specific backend text.' } },
      500,
    ));
    const error = await getCameraStatus({ fetchImpl }).catch((e) => e);
    expect(error.code).toBe('something_new');
    expect(error.message).toBe('Specific backend text.');
  });

  it('gives a generic message when an error body is not JSON', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 502,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    }));
    const error = await getCameraStatus({ fetchImpl }).catch((e) => e);
    expect(error.code).toBe('http_502');
    expect(error.message).toMatch(/Something went wrong/);
  });
});
