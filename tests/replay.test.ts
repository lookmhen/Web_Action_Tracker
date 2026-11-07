import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeReplayStep, setElementValueWithTracker, pollForElement } from '../src/content-script/replay';
import { ActionEvent } from '../src/types/schema';

describe('In-Browser Replay Engine', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="wrapper">
        <input id="user-name" type="text" />
        <button id="btn-submit" data-testid="submit-btn">Submit</button>
      </div>
    `;
    // Mock scrollIntoView
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('updates input value and dispatches input/change synthetic events for React/Vue', async () => {
    const input = document.getElementById('user-name') as HTMLInputElement;
    let inputFired = false;
    let changeFired = false;
    input.addEventListener('input', () => { inputFired = true; });
    input.addEventListener('change', () => { changeFired = true; });

    // Mock React _valueTracker
    (input as any)._valueTracker = { setValue: vi.fn() };

    const step: ActionEvent = {
      id: 'step_1',
      category: 'action',
      type: 'input',
      timestamp: 100,
      url: 'http://localhost',
      selectors: { tag: 'input', id: 'user-name', css: '#user-name' },
      value: 'qa_user'
    };

    const result = await executeReplayStep(step, { timeoutMs: 500, pollIntervalMs: 50 });
    expect(result.success).toBe(true);
    expect(input.value).toBe('qa_user');
    expect(inputFired).toBe(true);
    expect(changeFired).toBe(true);
    expect((input as any)._valueTracker.setValue).toHaveBeenCalled();
  });

  it('clicks element with auto-scroll', async () => {
    const btn = document.getElementById('btn-submit') as HTMLButtonElement;
    let clicked = false;
    btn.addEventListener('click', () => { clicked = true; });

    const step: ActionEvent = {
      id: 'step_2',
      category: 'action',
      type: 'click',
      timestamp: 200,
      url: 'http://localhost',
      selectors: { tag: 'button', testId: 'submit-btn', css: 'button' }
    };

    const result = await executeReplayStep(step, { timeoutMs: 500, pollIntervalMs: 50 });
    expect(result.success).toBe(true);
    expect(clicked).toBe(true);
    expect(btn.scrollIntoView).toHaveBeenCalled();
  });

  it('times out cleanly when element is missing (Review Focus #4)', async () => {
    const step: ActionEvent = {
      id: 'step_3',
      category: 'action',
      type: 'click',
      timestamp: 300,
      url: 'http://localhost',
      selectors: { tag: 'button', id: 'non-existent', css: '#non-existent' }
    };

    const result = await executeReplayStep(step, { timeoutMs: 150, pollIntervalMs: 50 });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Element not found');
  });
});
