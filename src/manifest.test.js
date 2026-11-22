// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BACKEND_ORIGIN } from './lib/config.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(root, 'public', 'manifest.json'), 'utf8'));

function extensionIdFromKey(key) {
  const hash = createHash('sha256').update(Buffer.from(key, 'base64')).digest('hex').slice(0, 32);
  return hash.split('').map((digit) => String.fromCharCode(97 + parseInt(digit, 16))).join('');
}

describe('extension manifest', () => {
  it('is Manifest V3', () => {
    expect(manifest.manifest_version).toBe(3);
  });

  it('opens the popup page and the captions window that exist in the project', () => {
    expect(manifest.action.default_popup).toBe('popup.html');
    expect(existsSync(resolve(root, manifest.action.default_popup))).toBe(true);
    expect(existsSync(resolve(root, 'captions.html'))).toBe(true);
    expect(existsSync(resolve(root, 'offscreen.html'))).toBe(true);
  });

  it('declares the SignBridge icon for the extension and the toolbar, at all four sizes', () => {
    const sizes = ['16', '32', '48', '128'];
    expect(Object.keys(manifest.icons).sort()).toEqual([...sizes].sort());
    expect(Object.keys(manifest.action.default_icon).sort()).toEqual([...sizes].sort());
    for (const size of sizes) {
      expect(manifest.action.default_icon[size]).toBe(manifest.icons[size]);
    }
  });

  it('points every icon at a PNG file that exists in public/ and has the declared size', () => {
    for (const [size, path] of Object.entries(manifest.icons)) {
      expect(path.startsWith('icons/')).toBe(true);
      const file = resolve(root, 'public', path);
      expect(existsSync(file), `${path} exists`).toBe(true);
      const bytes = readFileSync(file);
      expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG');
      expect(bytes.readUInt32BE(16)).toBe(Number(size));
      expect(bytes.readUInt32BE(20)).toBe(Number(size));
    }
  });

  it('requests only the exact local backend host, with no unrestricted website access', () => {
    expect(manifest.host_permissions).toEqual([`${BACKEND_ORIGIN}/*`]);
    expect(manifest.host_permissions).not.toContain('<all_urls>');
  });

  it('requests the approved meeting permissions and no broad tab or website access', () => {
    expect(manifest.permissions).toEqual(['activeTab', 'scripting', 'storage', 'tabCapture', 'offscreen']);
    expect(manifest.permissions).not.toContain('tabs');
    expect(manifest.permissions).not.toContain('unlimitedStorage');
    expect(manifest.permissions).not.toContain('sidePanel');
    expect(manifest.content_scripts).toBeUndefined();
    expect(manifest.web_accessible_resources).toBeUndefined();
  });

  it('runs one module service worker for capture orchestration', () => {
    expect(manifest.background).toEqual({ service_worker: 'background.js', type: 'module' });
  });

  it('requires Chrome 116 for service-worker to offscreen stream IDs', () => {
    expect(Number(manifest.minimum_chrome_version)).toBeGreaterThanOrEqual(116);
  });

  it('pins the extension ID that the backend CORS allow-list names', () => {
    expect(manifest.key).toBeTypeOf('string');
    expect(extensionIdFromKey(manifest.key)).toBe('hfccobalkbgnibbjlmjmpjkffleccace');
  });

  it('labels itself as experimental, not as a translator', () => {
    expect(manifest.name).toMatch(/experimental/i);
    expect(manifest.description).toMatch(/not a verified/i);
  });
});
