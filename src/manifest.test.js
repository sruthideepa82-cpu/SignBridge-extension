// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BACKEND_ORIGIN } from './lib/config.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(root, 'public', 'manifest.json'), 'utf8'));

describe('extension manifest', () => {
  it('is Manifest V3', () => {
    expect(manifest.manifest_version).toBe(3);
  });

  it('opens the popup page that exists in the project', () => {
    expect(manifest.action.default_popup).toBe('popup.html');
    expect(existsSync(resolve(root, manifest.action.default_popup))).toBe(true);
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

  it('requests only activeTab, scripting and storage, with no camera permission and no content scripts', () => {
    expect(manifest.permissions).toEqual(['activeTab', 'scripting', 'storage']);
    expect(manifest.permissions).not.toContain('tabs');
    expect(manifest.permissions).not.toContain('unlimitedStorage');
    expect(manifest.content_scripts).toBeUndefined();
    expect(manifest.web_accessible_resources).toBeUndefined();
  });

  it('labels itself as experimental, not as a translator', () => {
    expect(manifest.name).toMatch(/experimental/i);
    expect(manifest.description).toMatch(/not a verified/i);
  });
});
