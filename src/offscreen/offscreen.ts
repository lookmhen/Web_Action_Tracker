/**
 * Copies plain text inside an MV3 offscreen document where clipboardWrite
 * permission allows execCommand('copy') independently of page focus or CSP.
 */
export function copyTextInOffscreen(text: string): boolean {
  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') {
    return false;
  }

  const textarea =
    (document.getElementById('wat-clipboard-target') as HTMLTextAreaElement | null) ||
    document.createElement('textarea');

  if (!textarea.parentNode) {
    const host = document.body || document.documentElement;
    if (!host) return false;
    host.appendChild(textarea);
  }

  textarea.value = text;
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, text.length);

  try {
    return document.execCommand('copy');
  } catch {
    return false;
  }
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.target !== 'offscreen' || message?.type !== 'OFFSCREEN_COPY') {
      return false;
    }

    const success = typeof message.text === 'string' ? copyTextInOffscreen(message.text) : false;
    sendResponse({ success });
    return false;
  });
}
