import { ActionEvent, ElementSelectors, RecordedSession, isActionEvent } from '../types/schema';

export interface ReplayOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
}

export function findElementBySelectors(selectors: ElementSelectors): HTMLElement | null {
  // 1. Try testId
  if (selectors.testId) {
    const el = document.querySelector(
      `[data-testid="${selectors.testId}"], [data-test="${selectors.testId}"], [data-qa="${selectors.testId}"]`
    );
    if (el instanceof HTMLElement) return el;
  }

  // 2. Try ID
  if (selectors.id) {
    const el = document.getElementById(selectors.id);
    if (el instanceof HTMLElement) return el;
  }

  // 3. Try name attribute for inputs
  if (selectors.name) {
    const el = document.querySelector(`[name="${selectors.name}"]`);
    if (el instanceof HTMLElement) return el;
  }

  // 4. Try Text content for buttons or links
  if (selectors.text && (selectors.tag === 'button' || selectors.tag === 'a')) {
    const candidates = document.querySelectorAll(selectors.tag);
    for (const cand of Array.from(candidates)) {
      if (cand instanceof HTMLElement && cand.textContent?.trim() === selectors.text.trim()) {
        return cand;
      }
    }
  }

  // 5. Try CSS selector
  if (selectors.css) {
    try {
      const el = document.querySelector(selectors.css);
      if (el instanceof HTMLElement) return el;
    } catch {
      // Invalid selector fallback
    }
  }

  return null;
}

export async function pollForElement(
  selectors: ElementSelectors,
  options?: ReplayOptions
): Promise<HTMLElement | null> {
  const timeoutMs = options?.timeoutMs ?? 5000;
  const pollIntervalMs = options?.pollIntervalMs ?? 100;
  const startTime = Date.now();

  return new Promise((resolve) => {
    const check = () => {
      const el = findElementBySelectors(selectors);
      if (el) {
        resolve(el);
        return;
      }
      if (Date.now() - startTime >= timeoutMs) {
        resolve(null);
        return;
      }
      setTimeout(check, pollIntervalMs);
    };
    check();
  });
}

export function setElementValueWithTracker(element: HTMLElement, value: string): void {
  const isInput = element instanceof HTMLInputElement;
  const isTextarea = element instanceof HTMLTextAreaElement;

  if (isInput || isTextarea) {
    const proto = isInput ? window.HTMLInputElement.prototype : window.HTMLTextAreaElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');

    const prevValue = (element as HTMLInputElement).value;
    if (desc?.set) {
      desc.set.call(element, value);
    } else {
      (element as HTMLInputElement).value = value;
    }

    // Trigger React 16+ valueTracker
    const tracker = (element as any)._valueTracker;
    if (tracker) {
      tracker.setValue(prevValue);
    }

    // Dispatch input & change events
    element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }
}

export function showSensitiveInputPrompt(element: HTMLElement): Promise<'resume' | 'skip'> {
  return new Promise((resolve) => {
    // Focus the target element
    element.focus();

    // Create floating interactive pause banner
    const banner = document.createElement('div');
    banner.id = '__wat_replay_sensitive_banner__';
    banner.style.position = 'fixed';
    banner.style.top = '16px';
    banner.style.left = '50%';
    banner.style.transform = 'translateX(-50%)';
    banner.style.zIndex = '2147483647';
    banner.style.backgroundColor = '#1e1b4b';
    banner.style.color = '#ffffff';
    banner.style.fontFamily = 'system-ui, -apple-system, sans-serif';
    banner.style.fontSize = '13px';
    banner.style.padding = '12px 18px';
    banner.style.borderRadius = '8px';
    banner.style.boxShadow = '0 10px 25px -5px rgba(0,0,0,0.5)';
    banner.style.border = '2px solid #6366f1';
    banner.style.display = 'flex';
    banner.style.alignItems = 'center';
    banner.style.gap = '12px';

    banner.innerHTML = `
      <span>🔒 <strong>Sensitive input detected:</strong> Please enter your value, then click Resume.</span>
      <button id="__wat_resume_btn__" style="background:#4f46e5; color:white; border:none; padding:6px 12px; border-radius:4px; font-weight:600; cursor:pointer;">Resume</button>
      <button id="__wat_skip_btn__" style="background:#475569; color:white; border:none; padding:6px 10px; border-radius:4px; cursor:pointer;">Skip</button>
    `;

    document.body.appendChild(banner);

    const cleanup = () => {
      if (document.body.contains(banner)) {
        document.body.removeChild(banner);
      }
    };

    const resumeBtn = banner.querySelector('#__wat_resume_btn__') as HTMLButtonElement;
    const skipBtn = banner.querySelector('#__wat_skip_btn__') as HTMLButtonElement;

    resumeBtn.onclick = () => {
      cleanup();
      resolve('resume');
    };

    skipBtn.onclick = () => {
      cleanup();
      resolve('skip');
    };
  });
}

export async function executeReplayStep(
  action: ActionEvent,
  options?: ReplayOptions
): Promise<{ success: boolean; error?: string }> {
  const element = await pollForElement(action.selectors, options);
  if (!element) {
    return {
      success: false,
      error: `Element not found: ${action.selectors.tag} (${action.selectors.css || action.selectors.id || action.selectors.testId})`
    };
  }

  // Smooth scroll element into center view
  try {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch {
    // Non-fatal if scrollIntoView fails in headless
  }

  // Handle sensitive input interactive pause
  if (action.isSensitive) {
    const userChoice = await showSensitiveInputPrompt(element);
    if (userChoice === 'resume') {
      return { success: true };
    } else {
      return { success: true };
    }
  }

  // Execute standard action types
  switch (action.type) {
    case 'click': {
      element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, composed: true }));
      element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, composed: true }));
      element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
      break;
    }
    case 'input':
    case 'change': {
      setElementValueWithTracker(element, action.value || '');
      break;
    }
    case 'keydown': {
      const key = action.key || 'Enter';
      element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true }));
      element.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, composed: true }));
      break;
    }
    default:
      break;
  }

  return { success: true };
}

export async function startReplayRunner(
  session: RecordedSession,
  onStepProgress?: (index: number) => void
): Promise<{ completed: boolean; stoppedAtIndex?: number; error?: string }> {
  const actionEvents = session.events.filter(isActionEvent);

  for (let i = 0; i < actionEvents.length; i++) {
    const action = actionEvents[i];
    if (onStepProgress) onStepProgress(i);

    const result = await executeReplayStep(action);
    if (!result.success) {
      return { completed: false, stoppedAtIndex: i, error: result.error };
    }

    // Brief delay between steps to simulate human interaction
    await new Promise((r) => setTimeout(r, 400));
  }

  return { completed: true };
}
