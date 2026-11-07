export const MASKED_STRING = '******';

export function maskValue(value?: string): string {
  return MASKED_STRING;
}

const SENSITIVE_KEYWORDS = /(password|passwd|secret|token|api_?key|auth|cvv|cvc|credit_?card|card_?number|cc_?number|ssn)/i;
const SENSITIVE_AUTOCOMPLETE = /(cc-number|cc-csc|cc-exp|current-password|new-password|one-time-code)/i;

export function isSensitiveInput(element: Element | null): boolean {
  if (!element) return false;

  const tag = element.tagName.toLowerCase();
  if (tag !== 'input' && tag !== 'textarea') {
    return false;
  }

  const input = element as HTMLInputElement;

  // 1. Password input type
  if (input.type && input.type.toLowerCase() === 'password') {
    return true;
  }

  // 2. Autocomplete attributes
  const autocomplete = input.getAttribute('autocomplete') || '';
  if (SENSITIVE_AUTOCOMPLETE.test(autocomplete)) {
    return true;
  }

  // 3. Name, ID, or Placeholder matching sensitive regex
  const name = input.name || input.getAttribute('name') || '';
  if (SENSITIVE_KEYWORDS.test(name)) {
    return true;
  }

  const id = input.id || '';
  if (SENSITIVE_KEYWORDS.test(id)) {
    return true;
  }

  const placeholder = input.placeholder || input.getAttribute('placeholder') || '';
  if (SENSITIVE_KEYWORDS.test(placeholder)) {
    return true;
  }

  const ariaLabel = input.getAttribute('aria-label') || '';
  if (SENSITIVE_KEYWORDS.test(ariaLabel)) {
    return true;
  }

  return false;
}
