import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createInspector, InspectorController } from '../src/content-script/inspector';

describe('Live Element Inspector', () => {
  const originalExecCommand = (document as any).execCommand;
  const originalChrome = (globalThis as any).chrome;
  let createdInspectors: InspectorController[] = [];

  function makeInspector(): InspectorController {
    const instance = createInspector();
    createdInspectors.push(instance);
    return instance;
  }

  beforeEach(() => {
    createdInspectors = [];
    document.body.innerHTML = `
      <div id="container">
        <button id="btn-save" class="btn primary" data-testid="save-btn">Save Changes</button>
      </div>
    `;
    // Mock navigator.clipboard
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      writable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined)
      }
    });
    delete (document as any).execCommand;
    delete (globalThis as any).chrome;
  });

  afterEach(() => {
    for (const inst of createdInspectors) {
      if (inst.isEnabled()) {
        inst.disable();
      }
    }
    createdInspectors = [];
    vi.restoreAllMocks();
    if (originalExecCommand !== undefined) {
      (document as any).execCommand = originalExecCommand;
    } else {
      delete (document as any).execCommand;
    }
    if (originalChrome !== undefined) {
      (globalThis as any).chrome = originalChrome;
    } else {
      delete (globalThis as any).chrome;
    }
  });

  it('toggles inspector mode and creates overlay elements', () => {
    const inspector = makeInspector();
    expect(inspector.isEnabled()).toBe(false);

    inspector.enable();
    expect(inspector.isEnabled()).toBe(true);
    expect(document.getElementById('__wat_inspector_box__')).toBeTruthy();
    expect(document.getElementById('__wat_inspector_card__')).toBeTruthy();

    inspector.disable();
    expect(inspector.isEnabled()).toBe(false);
    expect(document.getElementById('__wat_inspector_box__')?.style.display).toBe('none');
  });

  it('updates tooltip card and highlight box on mouseover', () => {
    const inspector = makeInspector();
    inspector.enable();

    const btn = document.getElementById('btn-save')!;
    btn.getBoundingClientRect = vi.fn().mockReturnValue({
      top: 50, left: 100, width: 80, height: 30, bottom: 80, right: 180
    });

    const mouseOverEvent = new MouseEvent('mouseover', { bubbles: true });
    btn.dispatchEvent(mouseOverEvent);

    const card = document.getElementById('__wat_inspector_card__')!;
    expect(card.innerHTML).toContain('save-btn');
    expect(card.innerHTML).toContain('button');
    expect(card.innerHTML).toContain('Save Changes');
  });

  it('copies full element details with selector on top to clipboard on click', () => {
    const inspector = makeInspector();
    inspector.enable();

    const btn = document.getElementById('btn-save')!;
    btn.getBoundingClientRect = vi.fn().mockReturnValue({
      top: 50, left: 100, width: 120, height: 42, bottom: 92, right: 220
    });

    let pageHandlerCalled = false;
    btn.addEventListener('click', () => {
      pageHandlerCalled = true;
    });

    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    btn.dispatchEvent(clickEvent);

    expect(pageHandlerCalled).toBe(false);
    expect(clickEvent.defaultPrevented).toBe(true);
    expect(navigator.clipboard.writeText).toHaveBeenCalled();
    const copiedText = (navigator.clipboard.writeText as any).mock.calls[0][0];

    // Selector must be at the very top
    expect(copiedText.startsWith('Selector: [data-testid="save-btn"]')).toBe(true);
    expect(copiedText).toContain('Tag: <button>');
    expect(copiedText).toContain('Size:');
    expect(copiedText).toContain('Color:');
    expect(copiedText).toContain('Box:');
    expect(copiedText).toContain('Font:');
  });

  it('shows visual toast on enable and disable', () => {
    const inspector = makeInspector();
    inspector.enable();

    const toast = document.getElementById('__wat_inspector_toast__');
    expect(toast).toBeTruthy();
    expect(toast?.style.display).toBe('block');
    expect(toast?.textContent).toContain('Inspector: ON');

    inspector.disable();
    expect(toast?.textContent).toContain('Inspector: OFF');
  });

  it('disables inspector when Escape key is pressed', () => {
    const inspector = makeInspector();
    inspector.enable();
    expect(inspector.isEnabled()).toBe(true);

    const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    window.dispatchEvent(escapeEvent);

    expect(inspector.isEnabled()).toBe(false);
    const box = document.getElementById('__wat_inspector_box__');
    expect(box?.style.display).toBe('none');
  });

  it('debounces rapid toggle calls within short interval', () => {
    const inspector = makeInspector();
    expect(inspector.isEnabled()).toBe(false);

    // First toggle: ON
    const firstState = inspector.toggle();
    expect(firstState).toBe(true);

    // Immediate second toggle within 50ms should be debounced and remain ON
    const secondState = inspector.toggle();
    expect(secondState).toBe(true);
    expect(inspector.isEnabled()).toBe(true);
  });

  it('extracts computed CSS styles including dimensions, colors, box model, and typography', () => {
    const inspector = makeInspector();
    inspector.enable();

    const btn = document.getElementById('btn-save')!;
    btn.getBoundingClientRect = vi.fn().mockReturnValue({
      top: 50, left: 100, width: 120, height: 42, bottom: 92, right: 220
    });

    // Mock computed styles
    vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element) => {
      return {
        display: 'inline-block',
        color: 'rgb(255, 255, 255)',
        backgroundColor: 'rgb(37, 99, 235)',
        paddingTop: '8px',
        paddingRight: '16px',
        paddingBottom: '8px',
        paddingLeft: '16px',
        marginTop: '0px',
        marginRight: '0px',
        marginBottom: '12px',
        marginLeft: '0px',
        fontSize: '14px',
        fontFamily: '"Inter", sans-serif',
        fontWeight: '600'
      } as any;
    });

    const mouseOverEvent = new MouseEvent('mouseover', { bubbles: true });
    btn.dispatchEvent(mouseOverEvent);

    const card = document.getElementById('__wat_inspector_card__')!;
    expect(card.innerHTML).toContain('120 × 42 px');
    expect(card.innerHTML).toContain('inline-block');
    expect(card.innerHTML).toContain('rgb(255, 255, 255)');
    expect(card.innerHTML).toContain('rgb(37, 99, 235)');
    expect(card.innerHTML).toContain('8px 16px'); // padding shorthand
    expect(card.innerHTML).toContain('0px 0px 12px'); // margin 3-value shorthand (top right/left bottom)
    expect(card.innerHTML).toContain('14px');
    expect(card.innerHTML).toContain('Inter');
    expect(card.innerHTML).toContain('600');
  });

  it('falls back to document.execCommand copy when navigator.clipboard is unavailable (e.g. HTTP site)', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      writable: true,
      value: undefined
    });

    let copiedViaTextarea = '';
    (document as any).execCommand = vi.fn((cmd: string) => {
      if (cmd === 'copy') {
        const active = document.activeElement as HTMLTextAreaElement | null;
        copiedViaTextarea = active?.tagName === 'TEXTAREA' ? active.value : '';
        return true;
      }
      return false;
    });

    const inspector = makeInspector();
    inspector.enable();

    const btn = document.getElementById('btn-save')!;
    btn.getBoundingClientRect = vi.fn().mockReturnValue({
      top: 50, left: 100, width: 120, height: 42, bottom: 92, right: 220
    });

    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => {
      expect((document as any).execCommand).toHaveBeenCalledWith('copy');
      const toast = document.getElementById('__wat_inspector_toast__')!;
      expect(toast.textContent).toContain('Copied details for [data-testid="save-btn"]');
      expect(toast.style.backgroundColor).toBe('rgb(16, 185, 129)');
    });

    expect(copiedViaTextarea.startsWith('Selector: [data-testid="save-btn"]')).toBe(true);
    expect(copiedViaTextarea).toContain('Tag: <button>');
    // Temporary textarea must be cleaned up
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('falls back to document.execCommand copy when navigator.clipboard.writeText rejects', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      writable: true,
      value: {
        writeText: vi.fn().mockRejectedValue(new DOMException('Document is not focused', 'NotAllowedError'))
      }
    });

    let copiedViaTextarea = '';
    (document as any).execCommand = vi.fn((cmd: string) => {
      if (cmd === 'copy') {
        const active = document.activeElement as HTMLTextAreaElement | null;
        copiedViaTextarea = active?.tagName === 'TEXTAREA' ? active.value : '';
        return true;
      }
      return false;
    });

    const inspector = makeInspector();
    inspector.enable();

    const btn = document.getElementById('btn-save')!;
    btn.getBoundingClientRect = vi.fn().mockReturnValue({
      top: 50, left: 100, width: 120, height: 42, bottom: 92, right: 220
    });

    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => {
      expect((document as any).execCommand).toHaveBeenCalledWith('copy');
      const toast = document.getElementById('__wat_inspector_toast__')!;
      expect(toast.textContent).toContain('Copied details for [data-testid="save-btn"]');
      expect(toast.style.backgroundColor).toBe('rgb(16, 185, 129)');
    });

    expect(copiedViaTextarea.startsWith('Selector: [data-testid="save-btn"]')).toBe(true);
  });

  it('falls back to background COPY_TO_CLIPBOARD when in-page clipboard and execCommand both fail', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      writable: true,
      value: {
        writeText: vi.fn().mockRejectedValue(new Error('Blocked by Permissions-Policy'))
      }
    });
    (document as any).execCommand = vi.fn().mockReturnValue(false);

    const sendMessageMock = vi.fn().mockResolvedValue({ success: true });
    (globalThis as any).chrome = {
      runtime: {
        sendMessage: sendMessageMock
      }
    };

    const inspector = makeInspector();
    inspector.enable();

    const btn = document.getElementById('btn-save')!;
    btn.getBoundingClientRect = vi.fn().mockReturnValue({
      top: 50, left: 100, width: 120, height: 42, bottom: 92, right: 220
    });

    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'COPY_TO_CLIPBOARD',
          text: expect.stringContaining('Selector: [data-testid="save-btn"]')
        })
      );
      const toast = document.getElementById('__wat_inspector_toast__')!;
      expect(toast.textContent).toContain('Copied details for [data-testid="save-btn"]');
      expect(toast.style.backgroundColor).toBe('rgb(16, 185, 129)');
    });
  });

  it('shows red error toast instead of fake green Copied toast when all clipboard methods fail', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      writable: true,
      value: {
        writeText: vi.fn().mockRejectedValue(new Error('Denied'))
      }
    });
    (document as any).execCommand = vi.fn().mockReturnValue(false);
    (globalThis as any).chrome = {
      runtime: {
        sendMessage: vi.fn().mockResolvedValue({ success: false })
      }
    };

    const inspector = makeInspector();
    inspector.enable();

    const btn = document.getElementById('btn-save')!;
    btn.getBoundingClientRect = vi.fn().mockReturnValue({
      top: 50, left: 100, width: 120, height: 42, bottom: 92, right: 220
    });

    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => {
      const toast = document.getElementById('__wat_inspector_toast__')!;
      expect(toast.textContent).toContain('Failed to copy');
      expect(toast.style.backgroundColor).toBe('rgb(239, 68, 68)');
    });
  });

  it('handles form elements containing a child input named "id" without crashing', async () => {
    document.body.innerHTML = `
      <form data-testid="login-form">
        <input name="id" value="123" />
      </form>
    `;
    const form = document.querySelector('form')!;
    const input = form.querySelector('input')!;
    // Simulate Chromium HTMLFormElement named-element property shadowing where form.id is an HTMLInputElement
    Object.defineProperty(form, 'id', {
      configurable: true,
      value: input
    });
    form.getBoundingClientRect = vi.fn().mockReturnValue({
      top: 10, left: 10, width: 200, height: 100, bottom: 110, right: 210
    });

    const inspector = makeInspector();
    inspector.enable();

    form.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    form.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
    });
    const copiedText = (navigator.clipboard.writeText as any).mock.calls[0][0];
    expect(copiedText).toContain('Selector: [data-testid="login-form"]');
  });
});
