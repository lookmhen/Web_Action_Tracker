import { describe, it, expect } from 'vitest';
import manifest from '../public/manifest.json';

describe('Project Manifest V3 Configuration', () => {
  it('should be valid Manifest V3 with required permissions and entries', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.name).toBe('Web Action Tracker & Bug Replay');
    expect(manifest.permissions).toContain('storage');
    expect(manifest.permissions).toContain('activeTab');
    expect(manifest.permissions).toContain('scripting');
    expect(manifest.background.service_worker).toBe('service-worker.js');
  });
});
