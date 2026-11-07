import { describe, it, expect } from 'vitest';
import { exportToMarkdown } from '../src/exporters/markdown';
import { RecordedSession } from '../src/types/schema';

describe('Markdown Exporter', () => {
  it('generates human-readable report with steps and failure sections', () => {
    const session: RecordedSession = {
      sessionId: 'rec_001',
      metadata: {
        startUrl: 'https://app.example.com/login',
        userAgent: 'Chrome/131',
        viewport: { width: 1920, height: 1080 },
        startedAt: 1794141480000
      },
      events: [
        {
          id: '1',
          category: 'action',
          type: 'input',
          timestamp: 1794141481000,
          url: 'https://app.example.com/login',
          selectors: { tag: 'input', id: 'user-input', name: 'Username', css: '#user-input' },
          value: 'qa_tester'
        },
        {
          id: '2',
          category: 'action',
          type: 'click',
          timestamp: 1794141482000,
          url: 'https://app.example.com/login',
          selectors: { tag: 'button', testId: 'login-submit', text: 'Sign In', css: 'button.btn-primary' }
        },
        {
          id: '3',
          category: 'network',
          type: 'fetch',
          timestamp: 1794141483000,
          url: 'https://app.example.com/login',
          method: 'POST',
          requestUrl: 'https://api.example.com/v1/coupons/apply',
          status: 500,
          durationMs: 320,
          responsePreview: '{"status":"error","code":"NULL_POINTER"}'
        },
        {
          id: '4',
          category: 'console',
          level: 'error',
          timestamp: 1794141484000,
          url: 'https://app.example.com/login',
          message: 'Uncaught TypeError: Cannot read property rate',
          stackTrace: 'at checkout.bundle.js:142:28'
        }
      ]
    };

    const md = exportToMarkdown(session);
    expect(md).toContain('## 🐛 Bug Reproduction Report');
    expect(md).toContain('Button **"Sign In"**');
    expect(md).toContain('Network Failure (HTTP 500)');
    expect(md).toContain('Uncaught Console Error');
    expect(md).toContain('https://api.example.com/v1/coupons/apply');
  });

  it('handles empty session gracefully (Review Focus #1)', () => {
    const emptySession: RecordedSession = {
      sessionId: 'rec_empty',
      metadata: { startUrl: 'https://example.com', userAgent: 'Chrome', viewport: { width: 1000, height: 800 }, startedAt: Date.now() },
      events: []
    };
    const md = exportToMarkdown(emptySession);
    expect(md).toContain('No events recorded');
  });
});
