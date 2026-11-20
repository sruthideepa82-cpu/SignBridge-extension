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

  it('requests only the exact local backend host, with no unrestricted website access', () => {
    expect(manifest.host_permissions).toEqual([`${BACKEND_ORIGIN}/*`]);
    expect(manifest.host_permissions).not.toContain('<all_urls>');
  });

  it('requests no API permissions, no camera permission and no content scripts', () => {
    expect(manifest.permissions ?? []).toEqual([]);
    expect(manifest.content_scripts).toBeUndefined();
    expect(manifest.web_accessible_resources).toBeUndefined();
  });

  it('labels itself as experimental, not as a translator', () => {
    expect(manifest.name).toMatch(/experimental/i);
    expect(manifest.description).toMatch(/not a verified/i);
  });
});
