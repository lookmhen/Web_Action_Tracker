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
});
