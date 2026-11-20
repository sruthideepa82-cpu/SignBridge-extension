import { API_BASE, REQUEST_TIMEOUT_MS } from './config.js';
import { messageForError } from './messages.js';

export class ApiError extends Error {
  constructor(message, { status = null, code = 'unknown_error' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

// Calls the existing SignBridge backend. Errors keep the backend's own code (for example camera_unavailable), so the
// popup can explain them. A missing backend becomes backend_unreachable, never a silent empty result.
export async function apiRequest(path, { method = 'GET', fetchImpl = globalThis.fetch, timeoutMs = REQUEST_TIMEOUT_MS, keepalive = false } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(`${API_BASE}${path}`, {
      method,
      headers: { Accept: 'application/json' },
      signal: controller.signal,
      keepalive,
    });
  } catch (error) {
    const timedOut = error?.name === 'AbortError';
    throw new ApiError(messageForError('backend_unreachable', timedOut), { code: 'backend_unreachable' });
  } finally {
    clearTimeout(timer);
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const code = payload?.error?.code ?? `http_${response.status}`;
    const backendMessage = payload?.error?.message ?? null;
    throw new ApiError(messageForError(code, false, backendMessage), { status: response.status, code });
  }
  return payload;
}

export const getHealth = (options) => apiRequest('/health', options);
export const getCameraStatus = (options) => apiRequest('/camera/status', options);
export const startCamera = (options) => apiRequest('/camera/start', { ...options, method: 'POST' });
export const stopCamera = (options) => apiRequest('/camera/stop', { ...options, method: 'POST' });
export const getLatestRecognition = (options) => apiRequest('/recognition/latest', options);
