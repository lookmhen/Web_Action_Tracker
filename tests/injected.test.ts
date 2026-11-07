import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupMainWorldInterception, resetInterceptionState, truncatePayload, sanitizeHeaders } from '../src/main-world/injected';

describe('Main World Interception', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetInterceptionState();
  });

  it('intercepts fetch 500 error and emits telemetry message', async () => {
    const postMessageSpy = vi.spyOn(window, 'postMessage');
    window.fetch = vi.fn().mockResolvedValue(new Response('{"error":"fail"}', { status: 500 }));
    setupMainWorldInterception();

    await window.fetch('https://api.example.com/data');

    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        source: '__WAT_TELEMETRY__',
        event: expect.objectContaining({ category: 'network', status: 500, requestUrl: 'https://api.example.com/data' })
      }),
      '*'
    );
  });

  it('handles fetch abort or network failure with status 0 safely (Review Focus #3)', async () => {
    const postMessageSpy = vi.spyOn(window, 'postMessage');
    window.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    setupMainWorldInterception();

    await expect(window.fetch('https://api.example.com/fail')).rejects.toThrow('Failed to fetch');

    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        source: '__WAT_TELEMETRY__',
        event: expect.objectContaining({ category: 'network', status: 0, error: 'Failed to fetch' })
      }),
      '*'
    );
  });

  it('intercepts console.error and emits console telemetry event', () => {
    const postMessageSpy = vi.spyOn(window, 'postMessage');
    const originalConsoleError = console.error;
    setupMainWorldInterception();

    console.error('Something went wrong in the app');

    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        source: '__WAT_TELEMETRY__',
        event: expect.objectContaining({
          category: 'console',
          level: 'error',
          message: 'Something went wrong in the app'
        })
      }),
      '*'
    );
  });

  it('truncates payload over 2KB (Review Focus #5)', () => {
    const hugePayload = 'A'.repeat(5000);
    const truncated = truncatePayload(hugePayload, 2048);
    expect(truncated.length).toBeLessThanOrEqual(2048 + 20);
    expect(truncated).toContain('... [truncated]');
  });

  it('sanitizes sensitive headers', () => {
    const headers = {
      'authorization': 'Bearer secret_token_123',
      'cookie': 'session=abc',
      'content-type': 'application/json'
    };
    const sanitized = sanitizeHeaders(headers);
    expect(sanitized['authorization']).toBe('[REDACTED]');
    expect(sanitized['cookie']).toBe('[REDACTED]');
    expect(sanitized['content-type']).toBe('application/json');
  });
});
