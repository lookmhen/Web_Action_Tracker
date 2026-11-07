import { describe, it, expect } from 'vitest';
import { exportToJson, importFromJson } from '../src/exporters/json';
import { RecordedSession } from '../src/types/schema';

describe('JSON Exporter and Importer', () => {
  const session: RecordedSession = {
    sessionId: 'rec_001',
    metadata: {
      startUrl: 'https://app.example.com/login',
      userAgent: 'Chrome',
      viewport: { width: 1920, height: 1080 },
      startedAt: 1794141480000
    },
    events: [
      {
        id: '1',
        category: 'action',
        type: 'click',
        timestamp: 1794141481000,
        url: 'https://app.example.com/login',
        selectors: { tag: 'button', id: 'btn-1', css: '#btn-1' }
      }
    ]
  };

  it('serializes session to JSON string', () => {
    const jsonStr = exportToJson(session);
    expect(jsonStr).toContain('"sessionId": "rec_001"');
    const parsed = JSON.parse(jsonStr);
    expect(parsed.sessionId).toBe('rec_001');
    expect(parsed.events.length).toBe(1);
  });

  it('parses and validates JSON session on import', () => {
    const jsonStr = exportToJson(session);
    const imported = importFromJson(jsonStr);
    expect(imported.sessionId).toBe('rec_001');
    expect(imported.metadata.startUrl).toBe('https://app.example.com/login');
    expect(imported.events.length).toBe(1);
  });

  it('rejects invalid JSON string or missing required fields', () => {
    expect(() => importFromJson('invalid json')).toThrow(/Invalid JSON/);
    expect(() => importFromJson('{"foo":"bar"}')).toThrow(/Missing required session metadata/);
  });
});
