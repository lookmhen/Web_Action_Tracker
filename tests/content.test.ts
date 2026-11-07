import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleDomEvent, handleTelemetryMessage } from '../src/content-script/content';

describe('Content Script Event Delegation', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div>
        <button id="btn-submit" data-testid="submit-btn">Submit</button>
        <input id="user-pass" type="password" />
        <div id="__wat_inspector_box__"></div>
      </div>
    `;
  });

  it('extracts action event on click in capture phase', () => {
    const btn = document.getElementById('btn-submit')!;
    const mockSend = vi.fn();
    const event = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(event, 'target', { value: btn });

    const tracked = handleDomEvent(event, mockSend);
    expect(tracked).toBeTruthy();
    expect(tracked?.category).toBe('action');
    expect(tracked?.type).toBe('click');
    expect(tracked?.selectors.id).toBe('btn-submit');
    expect(mockSend).toHaveBeenCalledWith(tracked);
  });

  it('masks value when input is sensitive', () => {
    const input = document.getElementById('user-pass') as HTMLInputElement;
    input.value = 'superSecret123';
    const mockSend = vi.fn();
    const event = new Event('input', { bubbles: true });
    Object.defineProperty(event, 'target', { value: input });

    const tracked = handleDomEvent(event, mockSend);
    expect(tracked).toBeTruthy();
    expect(tracked?.isSensitive).toBe(true);
    expect(tracked?.value).toBe('******');
  });

  it('ignores clicks or events on extension overlay elements', () => {
    const overlay = document.getElementById('__wat_inspector_box__')!;
    const mockSend = vi.fn();
    const event = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(event, 'target', { value: overlay });

    const tracked = handleDomEvent(event, mockSend);
    expect(tracked).toBeNull();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('forwards telemetry postMessage to service worker', () => {
    const mockSend = vi.fn();
    const telemetryEvent = {
      source: '__WAT_TELEMETRY__',
      event: {
        category: 'network',
        type: 'fetch',
        status: 500
      }
    };

    handleTelemetryMessage({ data: telemetryEvent } as MessageEvent, mockSend);
    expect(mockSend).toHaveBeenCalledWith(telemetryEvent.event);
  });
});
