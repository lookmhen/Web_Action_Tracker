import { describe, it, expect } from 'vitest';
import { isSensitiveInput, maskValue } from '../src/utils/masking';

describe('Masking Engine', () => {
  it('identifies password type as sensitive', () => {
    const input = document.createElement('input');
    input.type = 'password';
    expect(isSensitiveInput(input)).toBe(true);
    expect(maskValue('secret123')).toBe('******');
  });

  it('identifies sensitive keywords in name, autocomplete, id (Review Focus #2)', () => {
    const input = document.createElement('input');
    input.name = 'creditCardNumber';
    input.setAttribute('autocomplete', 'cc-number');
    expect(isSensitiveInput(input)).toBe(true);

    const apiKeyInput = document.createElement('input');
    apiKeyInput.id = 'apiKey';
    expect(isSensitiveInput(apiKeyInput)).toBe(true);

    const normalInput = document.createElement('input');
    normalInput.type = 'text';
    normalInput.name = 'username';
    expect(isSensitiveInput(normalInput)).toBe(false);
  });
});
