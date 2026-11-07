import { NetworkEvent, ConsoleEvent } from '../types/schema';

export const TELEMETRY_SOURCE = '__WAT_TELEMETRY__';

export function truncatePayload(str?: string | null, maxLen = 2048): string {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return `${str.substring(0, maxLen)}... [truncated]`;
}

export function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  const sensitiveRegex = /(authorization|cookie|set-cookie|token|api_?key)/i;
  for (const [key, value] of Object.entries(headers)) {
    if (sensitiveRegex.test(key)) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = value;
    }
  }
  return result;
}

function emitTelemetry(event: NetworkEvent | ConsoleEvent): void {
  try {
    window.postMessage({ source: TELEMETRY_SOURCE, event }, '*');
  } catch (err) {
    // Fail-safe: do not crash host page
  }
}

let isInitialized = false;

export function resetInterceptionState(): void {
  isInitialized = false;
}

export function setupMainWorldInterception(): void {
  if (isInitialized) return;
  isInitialized = true;

  // 1. Monkey-patch window.fetch
  const originalFetch = window.fetch;
  if (originalFetch) {
    window.fetch = async function (...args: Parameters<typeof originalFetch>): Promise<Response> {
      const startTime = Date.now();
      const request = args[0];
      const requestUrl = typeof request === 'string' 
        ? request 
        : (request instanceof Request ? request.url : String(request));
      const init = args[1];
      const method = (init?.method || (request instanceof Request ? request.method : 'GET')).toUpperCase();

      try {
        const response = await originalFetch.apply(this, args);
        const durationMs = Date.now() - startTime;

        if (response.status >= 400) {
          let responsePreview: string | undefined = undefined;
          try {
            const clone = response.clone();
            const text = await clone.text();
            responsePreview = truncatePayload(text);
          } catch {
            responsePreview = '[Failed to read response body]';
          }

          const networkEvent: NetworkEvent = {
            id: `net_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            category: 'network',
            type: 'fetch',
            timestamp: startTime,
            url: window.location.href,
            method,
            requestUrl,
            status: response.status,
            durationMs,
            responsePreview
          };
          emitTelemetry(networkEvent);
        }

        return response;
      } catch (error: any) {
        const durationMs = Date.now() - startTime;
        const networkEvent: NetworkEvent = {
          id: `net_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          category: 'network',
          type: 'fetch',
          timestamp: startTime,
          url: window.location.href,
          method,
          requestUrl,
          status: 0,
          durationMs,
          error: error?.message || 'Network error / fetch failed'
        };
        emitTelemetry(networkEvent);
        throw error;
      }
    };
  }

  // 2. Monkey-patch XMLHttpRequest
  if (typeof window !== 'undefined' && window.XMLHttpRequest) {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (
      this: XMLHttpRequest & { _watMethod?: string; _watUrl?: string; _watStartTime?: number },
      method: string,
      url: string | URL,
      ...rest: any[]
    ) {
      this._watMethod = method.toUpperCase();
      this._watUrl = url.toString();
      return (originalOpen as any).apply(this, [method, url, ...rest]);
    };

    XMLHttpRequest.prototype.send = function (
      this: XMLHttpRequest & { _watMethod?: string; _watUrl?: string; _watStartTime?: number },
      body?: Document | XMLHttpRequestBodyInit | null
    ) {
      this._watStartTime = Date.now();

      this.addEventListener('readystatechange', () => {
        if (this.readyState === 4) {
          const durationMs = Date.now() - (this._watStartTime || Date.now());
          if (this.status >= 400 || this.status === 0) {
            let responsePreview: string | undefined = undefined;
            try {
              if (this.responseType === '' || this.responseType === 'text') {
                responsePreview = truncatePayload(this.responseText);
              }
            } catch {
              // Body unreadable
            }

            const networkEvent: NetworkEvent = {
              id: `xhr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              category: 'network',
              type: 'xhr',
              timestamp: this._watStartTime || Date.now(),
              url: window.location.href,
              method: this._watMethod || 'GET',
              requestUrl: this._watUrl || '',
              status: this.status,
              durationMs,
              responsePreview
            };
            emitTelemetry(networkEvent);
          }
        }
      });

      return originalSend.apply(this, [body]);
    };
  }

  // 3. Monkey-patch console.error
  const originalConsoleError = console.error;
  console.error = function (...args: any[]) {
    originalConsoleError.apply(console, args);

    const message = args.map(arg => {
      if (typeof arg === 'string') return arg;
      if (arg instanceof Error) return arg.message;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    }).join(' ');

    const errObj = args.find(a => a instanceof Error);
    const stackTrace = errObj ? errObj.stack : undefined;

    const consoleEvt: ConsoleEvent = {
      id: `err_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      category: 'console',
      level: 'error',
      timestamp: Date.now(),
      url: window.location.href,
      message,
      stackTrace
    };
    emitTelemetry(consoleEvt);
  };

  // 4. Global window.onerror
  if (typeof window !== 'undefined') {
    window.addEventListener('error', (event) => {
      const consoleEvt: ConsoleEvent = {
        id: `err_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        category: 'console',
        level: 'error',
        timestamp: Date.now(),
        url: window.location.href,
        message: event.message || 'Uncaught error',
        stackTrace: event.error?.stack || `${event.filename}:${event.lineno}:${event.colno}`
      };
      emitTelemetry(consoleEvt);
    });
  }
}

// Auto-initialize when loaded as a standalone script in MAIN world
if (typeof window !== 'undefined' && typeof process === 'undefined') {
  setupMainWorldInterception();
}
