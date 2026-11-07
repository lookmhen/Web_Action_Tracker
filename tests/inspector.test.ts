import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createInspector } from '../src/content-script/inspector';

describe('Live Element Inspector', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="container">
        <button id="btn-save" class="btn primary" data-testid="save-btn">Save Changes</button>
      </div>
    `;
    // Mock navigator.clipboard
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined)
      }
    });
  });

  it('toggles inspector mode and creates overlay elements', () => {
    const inspector = createInspector();
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
    const inspector = createInspector();
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

  it('copies computed selector to clipboard and stops propagation on click', () => {
    const inspector = createInspector();
    inspector.enable();

    const btn = document.getElementById('btn-save')!;
    let pageHandlerCalled = false;
    btn.addEventListener('click', () => {
      pageHandlerCalled = true;
    });

    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    btn.dispatchEvent(clickEvent);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('[data-testid="save-btn"]');
    expect(pageHandlerCalled).toBe(false);
    expect(clickEvent.defaultPrevented).toBe(true);
  });

  it('shows visual toast on enable and disable', () => {
    const inspector = createInspector();
    inspector.enable();

    const toast = document.getElementById('__wat_inspector_toast__');
    expect(toast).toBeTruthy();
    expect(toast?.style.display).toBe('block');
    expect(toast?.textContent).toContain('Inspector: ON');

    inspector.disable();
    expect(toast?.textContent).toContain('Inspector: OFF');
  });

  it('debounces rapid toggle calls within short interval', () => {
    const inspector = createInspector();
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
    const inspector = createInspector();
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
});
