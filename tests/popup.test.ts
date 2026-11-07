import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupPopupHandlers } from '../src/ui/popup/popup';
import { RecordedSession } from '../src/types/schema';

describe('Popup UI Handlers', () => {
  let mockSession: RecordedSession;

  beforeEach(() => {
    mockSession = {
      sessionId: 'rec_test',
      metadata: { startUrl: 'https://app.com', userAgent: 'Chrome', viewport: { width: 1920, height: 1080 }, startedAt: 100 },
      events: [
        { id: '1', category: 'action', type: 'click', timestamp: 101, url: 'https://app.com', selectors: { tag: 'button', id: 'b1', css: '#b1' } }
      ]
    };

    document.body.innerHTML = `
      <div id="status-badge">IDLE</div>
      <div id="event-count">0</div>
      <button id="btn-record">Record</button>
      <button id="btn-inspect">Inspect</button>
      <button id="btn-replay">Replay</button>
      <button id="btn-export-md">Copy MD</button>
      <button id="btn-export-pw">Copy Playwright</button>
      <button id="btn-export-json">Export JSON</button>
      <input type="file" id="input-import-json" />
      <div id="event-list"></div>
      <div id="toast-msg"></div>
    `;

    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined)
      }
    });
  });

  it('binds record toggle and updates UI status to RECORDING', async () => {
    const mockSend = vi.fn().mockImplementation((msg) => {
      if (msg.type === 'START_RECORDING') {
        return Promise.resolve({ success: true });
      }
      return Promise.resolve({ status: 'IDLE' });
    });

    const mockGetActiveTab = vi.fn().mockResolvedValue({ id: 101, url: 'https://app.com' });

    setupPopupHandlers({ sendMessage: mockSend, getActiveTab: mockGetActiveTab });
    const btn = document.getElementById('btn-record') as HTMLButtonElement;
    btn.click();

    // Allow promise tick
    await new Promise(r => setTimeout(r, 10));

    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ type: 'START_RECORDING', tabId: 101 }));
    expect(document.getElementById('status-badge')?.textContent).toBe('RECORDING');
  });

  it('triggers inspector toggle and closes popup window', async () => {
    const mockSend = vi.fn().mockResolvedValue({ success: true, isInspecting: true });
    const mockGetActiveTab = vi.fn().mockResolvedValue({ id: 101, url: 'https://app.com' });
    const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => {});

    setupPopupHandlers({ sendMessage: mockSend, getActiveTab: mockGetActiveTab });
    const btn = document.getElementById('btn-inspect') as HTMLButtonElement;
    btn.click();

    await new Promise(r => setTimeout(r, 10));
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ type: 'TOGGLE_INSPECTOR', tabId: 101 }));
    expect(closeSpy).toHaveBeenCalled();
    closeSpy.mockRestore();
  });

  it('exports markdown to clipboard', async () => {
    const mockSend = vi.fn().mockResolvedValue({ success: true });
    const mockGetActiveTab = vi.fn().mockResolvedValue({ id: 101, url: 'https://app.com' });

    const handlers = setupPopupHandlers({
      sendMessage: mockSend,
      getActiveTab: mockGetActiveTab,
      initialSession: mockSession
    });

    const btnMd = document.getElementById('btn-export-md') as HTMLButtonElement;
    btnMd.click();

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('## 🐛 Bug Reproduction Report')
    );
  });
});
