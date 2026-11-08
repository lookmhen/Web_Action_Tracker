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

  it('formats environment metadata, request payloads, and collapsible screenshots in report', () => {
    const session: RecordedSession = {
      sessionId: 'rec_qa',
      metadata: {
        startUrl: 'https://app.com',
        userAgent: 'Chrome',
        viewport: { width: 1920, height: 1080 },
        startedAt: 1000,
        environment: {
          os: 'Windows 11',
          browser: 'Chrome 130',
          screenResolution: { width: 2560, height: 1440 },
          viewport: { width: 1920, height: 1080 },
          devicePixelRatio: 1.25,
          language: 'en-US',
          online: true
        }
      },
      events: [
        {
          id: 'n1', category: 'network', type: 'fetch', timestamp: 1050, url: 'https://app.com',
          method: 'POST', requestUrl: 'https://api.app.com/checkout', status: 500, durationMs: 120,
          requestPayload: '{"cartId":"123","items":[1,2]}', responsePreview: 'Internal Server Error'
        }
      ],
      screenshots: [
        { id: 's1', timestamp: 1060, trigger: 'error_network', dataUrl: 'data:image/jpeg;base64,abc123mock', url: 'https://app.com' }
      ]
    };

    const md = exportToMarkdown(session);
    expect(md).toContain('## 💻 System & Environment');
    expect(md).toContain('| OS | Windows 11 |');
    expect(md).toContain('<summary>Request Payload</summary>');
    expect(md).toContain('{"cartId":"123","items":[1,2]}');
    expect(md).toContain('## 📸 Visual Evidence');
    expect(md).toContain('<details><summary>📸 View Image');
    expect(md).toContain('data:image/jpeg;base64,abc123mock');
  });

  it('formats React component name, props, and handler in markdown steps', () => {
    const session: RecordedSession = {
      sessionId: 's1',
      metadata: { startUrl: 'https://app.com', userAgent: 'Chrome', viewport: { width: 1920, height: 1080 }, startedAt: 100 },
      events: [
        {
          id: '1', category: 'action', type: 'click', timestamp: 101, url: 'https://app.com',
          selectors: { tag: 'button', id: 'btn-pay', css: '#btn-pay' },
          handler: {
            name: 'handlePayment',
            componentName: 'OrderButton',
            props: { orderId: 'ORD-999', total: 450 }
          }
        }
      ]
    };

    const md = exportToMarkdown(session);
    expect(md).toContain('<OrderButton orderId="ORD-999" total=450 />');
    expect(md).toContain('**Handler:** `handlePayment`');
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
