import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupMainWorldInterception, resetInterceptionState, truncatePayload, sanitizeHeaders, sanitizePayload } from '../src/main-world/injected';

describe('Main World Interception', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetInterceptionState();
  });

  it('intercepts fetch 500 error and emits telemetry message with sanitized request payload', async () => {
    const postMessageSpy = vi.spyOn(window, 'postMessage');
    window.fetch = vi.fn().mockResolvedValue(new Response('{"error":"fail"}', { status: 500 }));
    setupMainWorldInterception();

    await window.fetch('https://api.example.com/checkout', {
      method: 'POST',
      body: JSON.stringify({
        cartId: 'c123',
        password: 'supersecretpassword',
        user: { apiKey: 'secret-key-999', name: 'John' }
      })
    });

    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        source: '__WAT_TELEMETRY__',
        event: expect.objectContaining({
          category: 'network',
          status: 500,
          requestUrl: 'https://api.example.com/checkout',
          requestPayload: expect.stringContaining('"cartId":"c123"')
        })
      }),
      '*'
    );

    const emittedEvent = postMessageSpy.mock.calls.find(c => c[0]?.source === '__WAT_TELEMETRY__')?.[0]?.event;
    expect(emittedEvent.requestPayload).toContain('"password":"[REDACTED]"');
    expect(emittedEvent.requestPayload).toContain('"apiKey":"[REDACTED]"');
    expect(emittedEvent.requestPayload).toContain('"name":"John"');
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

  it('sanitizes nested JSON and query/form payload with password, token, secret', () => {
    const payload = JSON.stringify({
      auth: {
        token: 'token123',
        nested: { password: 'pass', deep: { secretKey: 'topsecret' } }
      },
      publicInfo: 'visible'
    });
    const sanitized = sanitizePayload(payload);
    expect(sanitized).toContain('"token":"[REDACTED]"');
    expect(sanitized).toContain('"password":"[REDACTED]"');
    expect(sanitized).toContain('"secretKey":"[REDACTED]"');
    expect(sanitized).toContain('"publicInfo":"visible"');
  });

  it('captures sanitized payload in XHR 500 error', () => {
    const postMessageSpy = vi.spyOn(window, 'postMessage');
    
    // Create a mock XHR class
    class MockXMLHttpRequest {
      readyState = 0;
      status = 0;
      responseText = 'Internal Error';
      responseType = '';
      _listeners: Record<string, Function[]> = {};

      open(method: string, url: string) {
        (this as any)._watMethod = method;
        (this as any)._watUrl = url;
      }
      send(body?: any) {
        this.readyState = 4;
        this.status = 500;
        this._listeners['readystatechange']?.forEach(fn => fn());
      }
      addEventListener(event: string, fn: Function) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(fn);
      }
    }

    (window as any).XMLHttpRequest = MockXMLHttpRequest;
    setupMainWorldInterception();

    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'https://api.example.com/xhr-endpoint');
    xhr.send(JSON.stringify({ secretToken: '12345', amount: 100 }));

    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        source: '__WAT_TELEMETRY__',
        event: expect.objectContaining({
          category: 'network',
          type: 'xhr',
          status: 500,
          requestPayload: expect.stringContaining('"secretToken":"[REDACTED]"')
        })
      }),
      '*'
    );
  });

  it('records listener function names on elements when addEventListener is called', () => {
    setupMainWorldInterception();
    const btn = document.createElement('button');
    function onCheckoutClick() {}
    btn.addEventListener('click', onCheckoutClick);

    const listeners = (btn as any).__wat_listeners__?.['click'];
    expect(listeners).toBeDefined();
    expect(listeners).toContain('onCheckoutClick');
  });
});
