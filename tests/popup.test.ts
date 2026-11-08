import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupPopupHandlers, copyScreenshotImage } from '../src/ui/popup/popup';
import { RecordedSession } from '../src/types/schema';

describe('Popup UI Handlers', () => {
  let mockSession: RecordedSession;

  beforeEach(() => {
    mockSession = {
      sessionId: 'rec_test',
      metadata: { startUrl: 'https://app.com', userAgent: 'Chrome', viewport: { width: 1920, height: 1080 }, startedAt: 100 },
      events: [
        { id: '1', category: 'action', type: 'click', timestamp: 101, url: 'https://app.com', selectors: { tag: 'button', id: 'b1', css: '#b1' } }
      ],
      screenshots: [
        { id: 'shot_1', timestamp: 102, trigger: 'manual', dataUrl: 'data:image/jpeg;base64,mockjpeg', url: 'https://app.com' }
      ]
    };

    document.body.innerHTML = `
      <div id="status-badge">IDLE</div>
      <div id="event-count">0</div>
      <button id="btn-record">Record</button>
      <button id="btn-snapshot">Snapshot</button>
      <button id="btn-inspect">Inspect</button>
      <button id="btn-replay">Replay</button>
      <button id="btn-clear">Clear</button>
      <div id="screenshot-section" style="display: none;">
        <span id="screenshot-count">0</span>
        <div id="screenshot-gallery"></div>
      </div>
      <button id="btn-export-md">Copy MD</button>
      <button id="btn-export-pw">Copy Playwright</button>
      <button id="btn-export-json">Export JSON</button>
      <input type="file" id="input-import-json" />
      <button id="btn-paste-json">Paste JSON</button>
      <div id="paste-modal" style="display: none;">
        <textarea id="paste-json-input"></textarea>
        <button id="btn-paste-apply">Load</button>
        <button id="btn-paste-cancel">Cancel</button>
      </div>
      <div id="event-list"></div>
      <div id="toast-msg"></div>
    `;

    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
        write: vi.fn().mockResolvedValue(undefined),
        readText: vi.fn().mockResolvedValue('')
      }
    });

    (globalThis as any).ClipboardItem = class MockClipboardItem {
      data: any;
      constructor(data: any) { this.data = data; }
    };
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

  it('binds snapshot button and triggers CAPTURE_SCREENSHOT message', async () => {
    const mockSend = vi.fn().mockResolvedValue({
      success: true,
      artifact: { id: 'shot_new', timestamp: 200, trigger: 'manual', dataUrl: 'data:image/jpeg;base64,new', url: 'https://app.com' }
    });
    const mockGetActiveTab = vi.fn().mockResolvedValue({ id: 101, url: 'https://app.com' });

    setupPopupHandlers({ sendMessage: mockSend, getActiveTab: mockGetActiveTab, initialSession: mockSession });
    const btnSnapshot = document.getElementById('btn-snapshot') as HTMLButtonElement;
    btnSnapshot.click();

    await new Promise(r => setTimeout(r, 10));
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ type: 'CAPTURE_SCREENSHOT', tabId: 101 }));
  });

  it('binds clear button and triggers CLEAR_SESSION', async () => {
    const mockSend = vi.fn().mockResolvedValue({ success: true });
    const mockGetActiveTab = vi.fn().mockResolvedValue({ id: 101, url: 'https://app.com' });

    setupPopupHandlers({ sendMessage: mockSend, getActiveTab: mockGetActiveTab, initialSession: mockSession });
    const btnClear = document.getElementById('btn-clear') as HTMLButtonElement;
    btnClear.click();

    await new Promise(r => setTimeout(r, 10));
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ type: 'CLEAR_SESSION' }));
    expect(document.getElementById('event-count')?.textContent).toBe('0');
  });

  it('renders screenshot gallery with copy image button', async () => {
    const mockSend = vi.fn().mockResolvedValue({ success: true });
    const mockGetActiveTab = vi.fn().mockResolvedValue({ id: 101, url: 'https://app.com' });

    setupPopupHandlers({ sendMessage: mockSend, getActiveTab: mockGetActiveTab, initialSession: mockSession });

    const gallery = document.getElementById('screenshot-gallery');
    expect(gallery?.innerHTML).toContain('btn-copy-img');
    expect(document.getElementById('screenshot-count')?.textContent).toBe('1');
  });

  it('copies binary image blob to clipboard via ClipboardItem', async () => {
    // Mock fetch for dataUrl
    globalThis.fetch = vi.fn().mockResolvedValue({
      blob: () => Promise.resolve(new Blob(['mockdata'], { type: 'image/png' }))
    } as any);

    const success = await copyScreenshotImage('data:image/jpeg;base64,mockdata');
    expect(success).toBe(true);
    expect(navigator.clipboard.write).toHaveBeenCalled();
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

    setupPopupHandlers({
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

  it('pastes JSON from clipboard directly when clipboard contains valid session JSON', async () => {
    const validJson = JSON.stringify(mockSession);
    (navigator.clipboard.readText as any).mockResolvedValue(validJson);

    const mockSend = vi.fn().mockResolvedValue({ success: true });
    const mockGetActiveTab = vi.fn().mockResolvedValue({ id: 101, url: 'https://app.com' });

    setupPopupHandlers({ sendMessage: mockSend, getActiveTab: mockGetActiveTab });

    const btnPaste = document.getElementById('btn-paste-json') as HTMLButtonElement;
    btnPaste.click();

    await new Promise(r => setTimeout(r, 20));

    expect(document.getElementById('event-count')?.textContent).toBe('1');
    expect(document.getElementById('toast-msg')?.textContent).toContain('Loaded 1 events');
  });

  it('opens paste modal if clipboard read fails or contains non-JSON', async () => {
    (navigator.clipboard.readText as any).mockResolvedValue('not a json string');

    const mockSend = vi.fn().mockResolvedValue({ success: true });
    const mockGetActiveTab = vi.fn().mockResolvedValue({ id: 101, url: 'https://app.com' });

    setupPopupHandlers({ sendMessage: mockSend, getActiveTab: mockGetActiveTab });

    const btnPaste = document.getElementById('btn-paste-json') as HTMLButtonElement;
    btnPaste.click();

    await new Promise(r => setTimeout(r, 20));

    const modal = document.getElementById('paste-modal') as HTMLElement;
    expect(modal.style.display).toBe('block');
  });

  it('loads JSON when pasted manually into modal and apply button clicked', async () => {
    const mockSend = vi.fn().mockResolvedValue({ success: true });
    const mockGetActiveTab = vi.fn().mockResolvedValue({ id: 101, url: 'https://app.com' });

    setupPopupHandlers({ sendMessage: mockSend, getActiveTab: mockGetActiveTab });

    const modal = document.getElementById('paste-modal') as HTMLElement;
    const input = document.getElementById('paste-json-input') as HTMLTextAreaElement;
    const btnApply = document.getElementById('btn-paste-apply') as HTMLButtonElement;

    modal.style.display = 'block';
    input.value = JSON.stringify(mockSession);
    btnApply.click();

    await new Promise(r => setTimeout(r, 20));

    expect(modal.style.display).toBe('none');
    expect(document.getElementById('event-count')?.textContent).toBe('1');
  });
});
