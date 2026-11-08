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

export function sanitizePayload(body: any, maxLen = 1024): string {
  if (!body) return '';

  const SENSITIVE_KEY_REGEX = /(password|token|secret|auth|api_?key|credential)/i;

  function maskObject(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map(item => maskObject(item));
    }
    const masked: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'object' && value !== null) {
        if (Array.isArray(value) && SENSITIVE_KEY_REGEX.test(key)) {
          masked[key] = '[REDACTED]';
        } else {
          masked[key] = maskObject(value);
        }
      } else if (SENSITIVE_KEY_REGEX.test(key)) {
        masked[key] = '[REDACTED]';
      } else {
        masked[key] = value;
      }
    }
    return masked;
  }

  let rawStr = '';

  if (typeof body === 'string') {
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed === 'object') {
        const masked = maskObject(parsed);
        return truncatePayload(JSON.stringify(masked), maxLen);
      }
    } catch {
      // Not JSON, continue to string sanitization
    }
    rawStr = body;
  } else if (typeof body === 'object') {
    if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
      const params = new URLSearchParams();
      body.forEach((val, key) => {
        params.append(key, SENSITIVE_KEY_REGEX.test(key) ? '[REDACTED]' : val);
      });
      return truncatePayload(params.toString(), maxLen);
    } else if (typeof FormData !== 'undefined' && body instanceof FormData) {
      const entries: string[] = [];
      body.forEach((val, key) => {
        const displayVal = SENSITIVE_KEY_REGEX.test(key) ? '[REDACTED]' : (typeof val === 'string' ? val : '[File]');
        entries.push(`${key}=${displayVal}`);
      });
      return truncatePayload(entries.join('&'), maxLen);
    } else {
      try {
        const masked = maskObject(body);
        return truncatePayload(JSON.stringify(masked), maxLen);
      } catch {
        rawStr = String(body);
      }
    }
  } else {
    rawStr = String(body);
  }

  // Fallback string sanitization for urlencoded or query formats
  const sanitizedStr = rawStr.replace(
    /((?:password|token|secret|auth|api_?key|credential)=)[^&]+/gi,
    '$1[REDACTED]'
  );

  return truncatePayload(sanitizedStr, maxLen);
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
            responsePreview,
            requestPayload: init?.body ? sanitizePayload(init.body) : undefined
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
          error: error?.message || 'Network error / fetch failed',
          requestPayload: init?.body ? sanitizePayload(init.body) : undefined
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
      this: XMLHttpRequest & { _watMethod?: string; _watUrl?: string; _watStartTime?: number; _watPayload?: string },
      method: string,
      url: string | URL,
      ...rest: any[]
    ) {
      this._watMethod = method.toUpperCase();
      this._watUrl = url.toString();
      return (originalOpen as any).apply(this, [method, url, ...rest]);
    };

    XMLHttpRequest.prototype.send = function (
      this: XMLHttpRequest & { _watMethod?: string; _watUrl?: string; _watStartTime?: number; _watPayload?: string },
      body?: Document | XMLHttpRequestBodyInit | null
    ) {
      this._watStartTime = Date.now();
      if (body) {
        try {
          this._watPayload = sanitizePayload(body);
        } catch {
          // ignore
        }
      }

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
              responsePreview,
              requestPayload: this._watPayload
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
