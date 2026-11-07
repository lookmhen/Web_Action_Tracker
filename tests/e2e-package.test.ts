import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Built Extension Package Verification', () => {
  it('verifies dist contains all required Manifest V3 assets', () => {
    const dist = path.resolve(__dirname, '../dist');
    expect(fs.existsSync(dist)).toBe(true);
    expect(fs.existsSync(path.join(dist, 'manifest.json'))).toBe(true);
    expect(fs.existsSync(path.join(dist, 'service-worker.js'))).toBe(true);
    expect(fs.existsSync(path.join(dist, 'content.js'))).toBe(true);
    expect(fs.existsSync(path.join(dist, 'injected.js'))).toBe(true);
    expect(fs.existsSync(path.join(dist, 'popup.html'))).toBe(true);
    expect(fs.existsSync(path.join(dist, 'popup.js'))).toBe(true);
    expect(fs.existsSync(path.join(dist, 'icons/icon16.png'))).toBe(true);
    expect(fs.existsSync(path.join(dist, 'icons/icon48.png'))).toBe(true);
    expect(fs.existsSync(path.join(dist, 'icons/icon128.png'))).toBe(true);

    const manifestContent = JSON.parse(fs.readFileSync(path.join(dist, 'manifest.json'), 'utf-8'));
    expect(manifestContent.manifest_version).toBe(3);
    expect(manifestContent.background.service_worker).toBe('service-worker.js');
    expect(manifestContent.action.default_popup).toBe('popup.html');
  });
});
