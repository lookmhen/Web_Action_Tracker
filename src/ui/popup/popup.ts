import { RecordedSession, ExtensionState, TrackedEvent, isActionEvent, isNetworkEvent, isConsoleEvent, isNavigationEvent } from '../../types/schema';
import { exportToMarkdown } from '../../exporters/markdown';
import { exportToPlaywright } from '../../exporters/playwright';
import { exportToJson, importFromJson } from '../../exporters/json';
import { extractEnvironmentMetadata } from '../../utils/environment';

export interface PopupDeps {
  sendMessage: (msg: any) => Promise<any>;
  getActiveTab: () => Promise<{ id?: number; url?: string }>;
  initialSession?: RecordedSession;
}

export async function copyScreenshotImage(dataUrl: string): Promise<boolean> {
  try {
    let blob: Blob;

    if (typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap !== 'undefined') {
      try {
        const response = await fetch(dataUrl);
        const sourceBlob = await response.blob();
        const bitmap = await createImageBitmap(sourceBlob);
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(bitmap, 0, 0);
        blob = await canvas.convertToBlob({ type: 'image/png' });
      } catch {
        const res = await fetch(dataUrl);
        blob = await res.blob();
      }
    } else {
      const res = await fetch(dataUrl);
      blob = await res.blob();
    }

    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      const pngBlob = blob.type === 'image/png' ? blob : new Blob([blob], { type: 'image/png' });
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': pngBlob })
      ]);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function setupPopupHandlers(deps: PopupDeps) {
  let currentStatus: string = 'IDLE';
  let activeTab: { id?: number; url?: string } | null = null;
  let currentSession: RecordedSession | null = deps.initialSession || null;

  // DOM Elements
  const statusBadge = document.getElementById('status-badge');
  const btnRecord = document.getElementById('btn-record');
  const btnRecordIcon = document.getElementById('btn-record-icon');
  const btnRecordText = document.getElementById('btn-record-text');
  const btnSnapshot = document.getElementById('btn-snapshot') as HTMLButtonElement | null;
  const btnInspect = document.getElementById('btn-inspect');
  const btnReplay = document.getElementById('btn-replay');
  const btnClear = document.getElementById('btn-clear') as HTMLButtonElement | null;
  const screenshotSection = document.getElementById('screenshot-section');
  const screenshotCountEl = document.getElementById('screenshot-count');
  const screenshotGalleryEl = document.getElementById('screenshot-gallery');
  const btnExportMd = document.getElementById('btn-export-md');
  const btnExportPw = document.getElementById('btn-export-pw');
  const btnExportJson = document.getElementById('btn-export-json');
  const inputImportJson = document.getElementById('input-import-json') as HTMLInputElement | null;
  const eventCountEl = document.getElementById('event-count');
  const failureCountEl = document.getElementById('failure-count');
  const eventListEl = document.getElementById('event-list');
  const toastEl = document.getElementById('toast-msg');

  function showToast(msg: string) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.style.display = 'block';
    setTimeout(() => {
      if (toastEl) toastEl.style.display = 'none';
    }, 2000);
  }

  function renderStatus(status: string) {
    currentStatus = status;
    if (statusBadge) {
      statusBadge.textContent = status;
      statusBadge.className = `badge badge-${status.toLowerCase()}`;
    }

    if (btnRecord && btnRecordText && btnRecordIcon) {
      if (status === 'RECORDING') {
        btnRecord.className = 'btn btn-stop';
        btnRecordIcon.textContent = '■';
        btnRecordText.textContent = 'Stop';
      } else {
        btnRecord.className = 'btn btn-primary';
        btnRecordIcon.textContent = '●';
        btnRecordText.textContent = 'Record';
      }
    }

    if (btnSnapshot) {
      btnSnapshot.disabled = status !== 'RECORDING';
    }

    if (btnClear) {
      btnClear.disabled = status === 'RECORDING';
    }
  }

  function renderScreenshots(session: RecordedSession | null) {
    if (!session || !session.screenshots || session.screenshots.length === 0) {
      if (screenshotSection) screenshotSection.style.display = 'none';
      if (screenshotCountEl) screenshotCountEl.textContent = '0';
      if (screenshotGalleryEl) screenshotGalleryEl.innerHTML = '';
      return;
    }

    if (screenshotSection) screenshotSection.style.display = 'block';
    if (screenshotCountEl) screenshotCountEl.textContent = String(session.screenshots.length);

    if (screenshotGalleryEl) {
      screenshotGalleryEl.innerHTML = session.screenshots.map((shot, idx) => `
        <div class="screenshot-thumb-card" title="${shot.label || shot.trigger}">
          <img src="${shot.dataUrl}" class="screenshot-thumb" alt="Shot ${idx + 1}" />
          <button class="btn-copy-img" data-url="${shot.dataUrl}">📋 Copy</button>
        </div>
      `).join('');

      screenshotGalleryEl.querySelectorAll('.btn-copy-img').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const target = e.currentTarget as HTMLButtonElement;
          const url = target.getAttribute('data-url') || '';
          const ok = await copyScreenshotImage(url);
          if (ok) showToast('Image copied to clipboard!');
          else showToast('Failed to copy image');
        });
      });
    }
  }

  function renderTimeline(session: RecordedSession | null) {
    if (!session || session.events.length === 0) {
      if (eventCountEl) eventCountEl.textContent = '0';
      if (failureCountEl) failureCountEl.textContent = '0';
      if (eventListEl) {
        eventListEl.innerHTML = `
          <div style="color: #64748b; font-size: 11px; text-align: center; margin-top: 20px;">
            No events recorded yet.
          </div>
        `;
      }
      return;
    }

    const events = session.events;
    if (eventCountEl) eventCountEl.textContent = String(events.length);

    let failures = 0;
    const itemsHtml = events.slice(-15).reverse().map((e: TrackedEvent) => {
      let icon = '📌';
      let text = '';
      let isFailure = false;

      if (isActionEvent(e)) {
        if (e.type === 'click') {
          icon = '👆';
          text = `Click ${e.selectors.tag} (${e.selectors.testId || e.selectors.id || e.selectors.text || e.selectors.css})`;
        } else if (e.type === 'input' || e.type === 'change') {
          icon = '⌨️';
          text = `Type "${e.value || ''}" into ${e.selectors.tag}`;
        } else if (e.type === 'keydown') {
          icon = '⏎';
          text = `Key [${e.key}] on ${e.selectors.tag}`;
        }
      } else if (isNetworkEvent(e)) {
        if (e.status >= 400 || e.status === 0 || e.error) {
          icon = '⚠️';
          text = `HTTP ${e.status} ${e.method} ${e.requestUrl}`;
          isFailure = true;
          failures++;
        } else {
          icon = '🌐';
          text = `${e.method} ${e.requestUrl}`;
        }
      } else if (isConsoleEvent(e)) {
        icon = '❌';
        text = `Console: ${e.message}`;
        isFailure = true;
        failures++;
      } else if (isNavigationEvent(e)) {
        icon = '🔗';
        try {
          const parsed = new URL(e.toUrl);
          text = `Navigate: ${parsed.pathname || '/'}`;
        } catch {
          text = `Navigate: ${e.toUrl}`;
        }
      }

      return `
        <div class="event-item ${isFailure ? 'failure' : ''}">
          <span class="event-icon">${icon}</span>
          <span class="event-text" title="${text}">${text}</span>
        </div>
      `;
    }).join('');

    if (failureCountEl) failureCountEl.textContent = String(failures);
    if (eventListEl) eventListEl.innerHTML = itemsHtml;
  }

  // Bind Buttons
  btnRecord?.addEventListener('click', async () => {
    if (currentStatus === 'RECORDING') {
      const resp = await deps.sendMessage({ type: 'STOP_RECORDING' });
      renderStatus('IDLE');
      if (resp?.session) {
        currentSession = resp.session;
        renderTimeline(currentSession);
        renderScreenshots(currentSession);
      }
    } else {
      if (!activeTab) {
        activeTab = await deps.getActiveTab();
      }
      if (activeTab?.id) {
        const environment = extractEnvironmentMetadata();
        await deps.sendMessage({
          type: 'START_RECORDING',
          tabId: activeTab.id,
          startUrl: activeTab.url || 'http://localhost',
          environment
        });
        renderStatus('RECORDING');
      }
    }
  });

  btnSnapshot?.addEventListener('click', async () => {
    if (!activeTab) {
      activeTab = await deps.getActiveTab();
    }
    const tabId = activeTab?.id;
    const resp = await deps.sendMessage({
      type: 'CAPTURE_SCREENSHOT',
      tabId,
      trigger: 'manual'
    });

    if (resp?.artifact && currentSession) {
      if (!currentSession.screenshots) currentSession.screenshots = [];
      currentSession.screenshots.push(resp.artifact);
      renderScreenshots(currentSession);
      showToast('📸 Screenshot captured!');
    }
  });

  btnClear?.addEventListener('click', async () => {
    await deps.sendMessage({ type: 'CLEAR_SESSION' });
    if (currentSession) {
      currentSession.events = [];
      currentSession.screenshots = [];
    }
    renderTimeline(currentSession);
    renderScreenshots(currentSession);
    showToast('Session cleared!');
  });

  btnInspect?.addEventListener('click', async () => {
    if (!activeTab) {
      activeTab = await deps.getActiveTab();
    }
    await deps.sendMessage({
      type: 'TOGGLE_INSPECTOR',
      tabId: activeTab?.id
    });
    // Close popup window so user can directly inspect elements on the active page
    if (typeof window !== 'undefined' && window.close) {
      window.close();
    }
  });

  btnReplay?.addEventListener('click', async () => {
    if (!currentSession || currentSession.events.length === 0) {
      showToast('No session to replay');
      return;
    }
    if (!activeTab) {
      activeTab = await deps.getActiveTab();
    }
    if (activeTab?.id) {
      renderStatus('REPLAYING');
      await deps.sendMessage({
        type: 'START_REPLAY',
        session: currentSession,
        tabId: activeTab.id
      });
      showToast('Replaying session in tab...');
    }
  });

  btnExportMd?.addEventListener('click', () => {
    if (!currentSession) {
      showToast('No session to export');
      return;
    }
    const md = exportToMarkdown(currentSession);
    navigator.clipboard.writeText(md).then(() => {
      showToast('Copied Markdown Report!');
    });
  });

  btnExportPw?.addEventListener('click', () => {
    if (!currentSession) {
      showToast('No session to export');
      return;
    }
    const pw = exportToPlaywright(currentSession);
    navigator.clipboard.writeText(pw).then(() => {
      showToast('Copied Playwright Script!');
    });
  });

  btnExportJson?.addEventListener('click', () => {
    if (!currentSession) {
      showToast('No session to export');
      return;
    }
    const jsonStr = exportToJson(currentSession);
    navigator.clipboard.writeText(jsonStr).then(() => {
      showToast('Copied JSON Session Dump!');
    });
  });

  inputImportJson?.addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const imported = importFromJson(reader.result as string);
        currentSession = imported;
        renderTimeline(currentSession);
        renderScreenshots(currentSession);
        showToast(`Loaded ${imported.events.length} events from JSON!`);
      } catch (err: any) {
        alert(`Failed to import JSON: ${err.message}`);
      }
    };
    reader.readAsText(file);
  });

  // Init data
  deps.getActiveTab().then(tab => {
    activeTab = tab;
  });

  if (currentSession) {
    renderScreenshots(currentSession);
  }

  deps.sendMessage({ type: 'GET_STATE' }).then((state: ExtensionState) => {
    if (state?.status) {
      renderStatus(state.status);
    }
    if (state?.currentSession && (state.currentSession.events.length > 0 || (state.currentSession.screenshots && state.currentSession.screenshots.length > 0))) {
      currentSession = state.currentSession;
      renderTimeline(currentSession);
      renderScreenshots(currentSession);
    } else if (currentSession) {
      renderTimeline(currentSession);
      renderScreenshots(currentSession);
    } else if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(['wat_current_session', 'wat_last_session'], (items) => {
        const fallback = items.wat_current_session || items.wat_last_session;
        if (fallback && (fallback.events?.length > 0 || fallback.screenshots?.length > 0)) {
          currentSession = fallback;
          renderTimeline(currentSession);
          renderScreenshots(currentSession);
        }
      });
    }
  });

  return {
    renderStatus,
    renderTimeline,
    renderScreenshots
  };
}

// Auto-run in browser popup window
if (typeof chrome !== 'undefined' && chrome.tabs && chrome.runtime) {
  setupPopupHandlers({
    sendMessage: (msg) => chrome.runtime.sendMessage(msg),
    getActiveTab: async () => {
      let tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!tabs || tabs.length === 0) {
        tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      }
      return { id: tabs[0]?.id, url: tabs[0]?.url };
    }
  });
}
