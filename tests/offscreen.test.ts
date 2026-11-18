import { describe, it, expect, vi, afterEach } from 'vitest';
import { copyTextInOffscreen } from '../src/offscreen/offscreen';

describe('Offscreen Clipboard Helper', () => {
  const originalExecCommand = (document as any).execCommand;

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalExecCommand !== undefined) {
      (document as any).execCommand = originalExecCommand;
    } else {
      delete (document as any).execCommand;
    }
    document.body.innerHTML = '';
  });

  it('copies text using textarea selection and execCommand', () => {
    document.body.innerHTML = '<textarea id="wat-clipboard-target"></textarea>';
    let copiedValue = '';
    (document as any).execCommand = vi.fn((cmd: string) => {
      if (cmd === 'copy') {
        const el = document.getElementById('wat-clipboard-target') as HTMLTextAreaElement;
        copiedValue = el.value;
        return true;
      }
      return false;
    });

    const result = copyTextInOffscreen('Selector: #submit-btn\nTag: <button>');
    expect(result).toBe(true);
    expect((document as any).execCommand).toHaveBeenCalledWith('copy');
    expect(copiedValue).toBe('Selector: #submit-btn\nTag: <button>');
  });
});
