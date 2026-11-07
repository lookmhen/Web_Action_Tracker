import { describe, it, expect } from 'vitest';
import { exportToPlaywright } from '../src/exporters/playwright';
import { RecordedSession } from '../src/types/schema';

describe('Playwright Exporter', () => {
  it('generates executable Playwright script with prioritized locators and bug annotations', () => {
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
          type: 'input',
          timestamp: 1794141481000,
          url: 'https://app.example.com/login',
          selectors: { tag: 'input', id: 'user-input', css: '#user-input' },
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
          durationMs: 320
        },
        {
          id: '4',
          category: 'console',
          level: 'error',
          timestamp: 1794141484000,
          url: 'https://app.example.com/login',
          message: 'TypeError: Cannot read property rate'
        }
      ]
    };

    const script = exportToPlaywright(session);
    expect(script).toContain("import { test, expect } from '@playwright/test';");
    expect(script).toContain("await page.goto('https://app.example.com/login');");
    expect(script).toContain("await page.locator('#user-input').fill('qa_tester');");
    expect(script).toContain("await page.getByTestId('login-submit').click();");
    expect(script).toContain('// [BUG DETECTED HERE]');
    expect(script).toContain('// Network Error: POST https://api.example.com/v1/coupons/apply -> 500');
    expect(script).toContain('// Console Error: TypeError: Cannot read property rate');
  });

  it('handles empty session gracefully (Review Focus #1)', () => {
    const emptySession: RecordedSession = {
      sessionId: 'rec_empty',
      metadata: { startUrl: 'https://example.com', userAgent: 'Chrome', viewport: { width: 1000, height: 800 }, startedAt: Date.now() },
      events: []
    };
    const script = exportToPlaywright(emptySession);
    expect(script).toContain("await page.goto('https://example.com');");
    expect(script).toContain('// No user actions recorded');
  });

  it('escapes single quotes in accessible name and text locators', () => {
    const sessionWithQuotes: RecordedSession = {
      sessionId: 'rec_quotes',
      metadata: { startUrl: 'https://example.com', userAgent: 'Chrome', viewport: { width: 1000, height: 800 }, startedAt: 100 },
      events: [
        {
          id: '1',
          category: 'action',
          type: 'click',
          timestamp: 101,
          url: 'https://example.com',
          selectors: { tag: 'button', role: 'button', name: "Don't Save", css: "button[name=\"don't\"]" }
        }
      ]
    };
    const script = exportToPlaywright(sessionWithQuotes);
    expect(script).toContain("page.getByRole('button', { name: 'Don\\'t Save' })");
  });
});
