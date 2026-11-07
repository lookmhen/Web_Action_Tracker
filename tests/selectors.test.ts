import { describe, it, expect, beforeEach } from 'vitest';
import { resolveElementSelectors, computeBestSelector } from '../src/utils/selectors';

describe('Selector Resolution Engine', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('extracts testId from data-testid, data-test, data-qa', () => {
    const btn = document.createElement('button');
    btn.setAttribute('data-testid', 'submit-login');
    btn.textContent = 'Sign In';
    document.body.appendChild(btn);

    const selectors = resolveElementSelectors(btn);
    expect(selectors.testId).toBe('submit-login');
    expect(selectors.tag).toBe('button');
    expect(selectors.text).toBe('Sign In');
    expect(computeBestSelector(selectors)).toBe('[data-testid="submit-login"]');
  });

  it('extracts role and accessible name or id', () => {
    const btn = document.createElement('button');
    btn.id = 'main-action';
    btn.setAttribute('aria-label', 'Close dialog');
    document.body.appendChild(btn);

    const selectors = resolveElementSelectors(btn);
    expect(selectors.id).toBe('main-action');
    expect(selectors.name).toBe('Close dialog');
    expect(computeBestSelector(selectors)).toBe('#main-action');
  });

  it('filters out dynamic hash classes and truncates long text', () => {
    const div = document.createElement('div');
    div.className = 'btn-primary css-1x8a2b sc-bwzfXH active-tab';
    div.textContent = 'This is an extremely long button label that exceeds thirty characters';
    document.body.appendChild(div);

    const selectors = resolveElementSelectors(div);
    expect(selectors.classes).toContain('btn-primary');
    expect(selectors.classes).toContain('active-tab');
    expect(selectors.classes).not.toContain('css-1x8a2b');
    expect(selectors.classes).not.toContain('sc-bwzfXH');
    expect(selectors.text?.length).toBeLessThanOrEqual(30);
  });
});
