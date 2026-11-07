import { RecordedSession, ExtensionState, TrackedEvent, isActionEvent, isNetworkEvent, isConsoleEvent } from '../../types/schema';
import { exportToMarkdown } from '../../exporters/markdown';
import { exportToPlaywright } from '../../exporters/playwright';
import { exportToJson, importFromJson } from '../../exporters/json';

export interface PopupDeps {
  sendMessage: (msg: any) => Promise<any>;
  getActiveTab: () => Promise<{ id?: number; url?: string }>;
  initialSession?: RecordedSession;
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
  const btnInspect = document.getElementById('btn-inspect');
  const btnReplay = document.getElementById('btn-replay');
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
      }
    } else {
      if (!activeTab) {
        activeTab = await deps.getActiveTab();
      }
      if (activeTab?.id) {
        await deps.sendMessage({
          type: 'START_RECORDING',
          tabId: activeTab.id,
          startUrl: activeTab.url || 'http://localhost'
        });
        renderStatus('RECORDING');
      }
    }
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

  deps.sendMessage({ type: 'GET_STATE' }).then((state: ExtensionState) => {
    if (state?.status) {
      renderStatus(state.status);
    }
    if (state?.currentSession) {
      currentSession = state.currentSession;
      renderTimeline(currentSession);
    } else if (currentSession) {
      renderTimeline(currentSession);
    }
  });

  return {
    renderStatus,
    renderTimeline
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
