import { ExtensionState, ExtensionStatus, RecordedSession, TrackedEvent, createNewSession, isActionEvent } from '../types/schema';

export class ServiceWorkerStateManager {
  private state: ExtensionState;
  private storage: chrome.storage.StorageArea;
  private actionApi?: typeof chrome.action;
  private tabsApi?: typeof chrome.tabs;
  private readyPromise: Promise<void>;
  private isExecutingStep = false;
  private replayStepTimer: any = null;
  private lastInspectorToggleTime = 0;

  constructor(
    storage: chrome.storage.StorageArea,
    actionApi?: typeof chrome.action,
    tabsApi?: typeof chrome.tabs
  ) {
    this.storage = storage;
    this.actionApi = actionApi;
    this.tabsApi = tabsApi;

    this.state = {
      status: 'IDLE',
      isInspecting: false
    };

    // Restore state from storage if exists, track via readyPromise
    this.readyPromise = new Promise((resolve) => {
      this.storage.get(['wat_state', 'wat_current_session'], (items) => {
        if (items?.wat_state) {
          this.state = items.wat_state;
        }
        if (items?.wat_current_session) {
          this.state.currentSession = items.wat_current_session;
        }
        this.updateBadge();
        resolve();
      });
    });
  }

  public async whenReady(): Promise<void> {
    await this.readyPromise;
  }

  public async getState(): Promise<ExtensionState> {
    await this.readyPromise;
    return { ...this.state };
  }

  public async startRecording(
    tabId: number,
    startUrl: string,
    userAgent = 'Chrome',
    viewport = { width: 1920, height: 1080 }
  ): Promise<void> {
    await this.readyPromise;
    const session = createNewSession(startUrl, userAgent, viewport);
    this.state = {
      status: 'RECORDING',
      isInspecting: this.state.isInspecting,
      activeTabId: tabId,
      currentSession: session
    };

    await this.persist();
    this.updateBadge('REC', '#ef4444');

    // Notify tab content script
    if (this.tabsApi?.sendMessage) {
      this.tabsApi.sendMessage(tabId, { type: 'STATUS_CHANGE', status: 'RECORDING' }).catch(() => {});
    }
  }

  public async recordEvent(event: TrackedEvent, fromTabId?: number): Promise<void> {
    await this.readyPromise;
    if (this.state.status !== 'RECORDING') return;
    if (fromTabId !== undefined && this.state.activeTabId !== undefined && fromTabId !== this.state.activeTabId) {
      return; // Ignore events from unmonitored tabs
    }

    if (this.state.currentSession) {
      this.state.currentSession.events.push(event);
      await this.persist();

      const actionCount = this.state.currentSession.events.filter(isActionEvent).length;
      this.updateBadge(String(actionCount), '#ef4444');
    }
  }

  public async stopRecording(): Promise<RecordedSession> {
    await this.readyPromise;
    const session = this.state.currentSession || createNewSession('', '', { width: 1920, height: 1080 });
    session.metadata.endedAt = Date.now();

    const activeTabId = this.state.activeTabId;

    this.state = {
      status: 'IDLE',
      isInspecting: this.state.isInspecting,
      activeTabId: undefined,
      currentSession: session
    };

    await this.storage.set({
      wat_state: this.state,
      wat_last_session: session
    });

    this.updateBadge('', '#000000');

    if (activeTabId && this.tabsApi?.sendMessage) {
      this.tabsApi.sendMessage(activeTabId, { type: 'STATUS_CHANGE', status: 'IDLE' }).catch(() => {});
    }

    return session;
  }

  public async setInspectorState(enabled: boolean): Promise<void> {
    await this.readyPromise;
    this.state.isInspecting = enabled;
    await this.persist();
  }

  public async toggleInspector(tabId?: number, forceState?: boolean): Promise<boolean> {
    await this.readyPromise;
    const now = Date.now();
    if (forceState === undefined && now - this.lastInspectorToggleTime < 500) {
      return this.state.isInspecting;
    }
    this.lastInspectorToggleTime = now;

    this.state.isInspecting = forceState !== undefined ? forceState : !this.state.isInspecting;
    await this.persist();

    let targetTabId = tabId || this.state.activeTabId;

    // Fallback: If not recording and tabId not passed, query active tab from lastFocusedWindow
    if (!targetTabId && this.tabsApi?.query) {
      const tabs = await new Promise<chrome.tabs.Tab[]>((resolve) => {
        this.tabsApi!.query({ active: true, lastFocusedWindow: true }, (tabs) => {
          resolve(tabs || []);
        });
      });
      targetTabId = tabs[0]?.id;
    }

    if (targetTabId && this.tabsApi?.sendMessage) {
      const payload = { type: 'SET_INSPECTOR', enabled: this.state.isInspecting };
      try {
        await this.tabsApi.sendMessage(targetTabId, payload);
      } catch {
        // If content script is not yet injected (e.g. tab opened before extension load), inject content.js
        const scripting = (globalThis as any).chrome?.scripting;
        if (scripting?.executeScript) {
          try {
            await scripting.executeScript({
              target: { tabId: targetTabId },
              files: ['content.js']
            });
            await this.tabsApi.sendMessage(targetTabId, payload);
          } catch {
            // Cannot script protected tab (e.g. chrome://)
          }
        }
      }
    }

    return this.state.isInspecting;
  }

  public async startReplay(session: RecordedSession, tabId: number): Promise<void> {
    await this.readyPromise;
    const actions = session.events.filter(isActionEvent);
    if (actions.length === 0) return;

    if (this.replayStepTimer) {
      clearTimeout(this.replayStepTimer);
      this.replayStepTimer = null;
    }
    this.isExecutingStep = false;

    this.state = {
      status: 'REPLAYING',
      isInspecting: false,
      activeTabId: tabId,
      currentSession: session,
      replayingStepIndex: 0
    };

    await this.storage.set({
      wat_state: this.state,
      wat_replay_queue: actions,
      wat_replay_step: 0
    });

    this.updateBadge('RPL', '#3b82f6');

    // Reset page to startUrl to guarantee a clean initial state
    if (this.tabsApi?.update && session.metadata.startUrl) {
      this.tabsApi.update(tabId, { url: session.metadata.startUrl });
    } else {
      this.scheduleNextReplayStep(tabId, 350);
    }
  }

  public scheduleNextReplayStep(tabId: number, delayMs = 400): void {
    if (this.replayStepTimer) {
      clearTimeout(this.replayStepTimer);
      this.replayStepTimer = null;
    }
    this.replayStepTimer = setTimeout(() => {
      this.replayStepTimer = null;
      this.executeNextReplayStep(tabId);
    }, delayMs);
  }

  public async executeNextReplayStep(tabId: number): Promise<void> {
    await this.readyPromise;
    if (this.state.status !== 'REPLAYING' || !this.state.currentSession) return;
    if (this.isExecutingStep) return;

    if (this.replayStepTimer) {
      clearTimeout(this.replayStepTimer);
      this.replayStepTimer = null;
    }

    const actions = this.state.currentSession.events.filter(isActionEvent);
    const index = this.state.replayingStepIndex ?? 0;

    if (index >= actions.length) {
      // Replay finished
      await this.stopReplay();
      return;
    }

    this.isExecutingStep = true;
    const nextAction = actions[index];
    this.state.replayingStepIndex = index + 1;
    await this.persist();

    if (this.tabsApi?.sendMessage) {
      try {
        const response = await this.tabsApi.sendMessage(tabId, {
          type: 'EXECUTE_REPLAY_STEP',
          action: nextAction,
          index
        });

        this.isExecutingStep = false;

        if (response?.success) {
          // Schedule next step with timer handle
          this.replayStepTimer = setTimeout(() => {
            this.executeNextReplayStep(tabId);
          }, 350);
        } else {
          console.warn('Replay step halted:', response?.error);
        }
      } catch (err) {
        this.isExecutingStep = false;
        console.warn('Tab navigation or communication delay during replay:', err);
      }
    } else {
      this.isExecutingStep = false;
    }
  }

  public async stopReplay(): Promise<void> {
    await this.readyPromise;
    if (this.replayStepTimer) {
      clearTimeout(this.replayStepTimer);
      this.replayStepTimer = null;
    }
    this.isExecutingStep = false;
    this.state.status = 'IDLE';
    this.state.replayingStepIndex = undefined;
    if (this.storage.remove) {
      await this.storage.remove(['wat_replay_queue', 'wat_replay_step']);
    }
    await this.persist();
    this.updateBadge('', '#000000');
  }

  private async persist(): Promise<void> {
    await this.storage.set({
      wat_state: this.state,
      wat_current_session: this.state.currentSession
    });
  }

  private updateBadge(text = '', color = '#ef4444'): void {
    if (this.actionApi) {
      this.actionApi.setBadgeText({ text });
      this.actionApi.setBadgeBackgroundColor({ color });
    }
  }
}

// Service worker runtime setup
if (typeof chrome !== 'undefined' && chrome.storage && chrome.runtime) {
  const manager = new ServiceWorkerStateManager(
    chrome.storage.local,
    chrome.action,
    chrome.tabs
  );

  // Message dispatcher
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const tabId = sender.tab?.id;

    switch (message.type) {
      case 'GET_STATE':
        manager.getState().then((state) => sendResponse(state));
        return true;

      case 'START_RECORDING':
        manager.startRecording(
          message.tabId,
          message.startUrl,
          message.userAgent,
          message.viewport
        ).then(() => {
          // Inject MAIN world script
          if (chrome.scripting) {
            chrome.scripting.executeScript({
              target: { tabId: message.tabId },
              world: 'MAIN',
              files: ['injected.js']
            }).catch(() => {});
          }
          sendResponse({ success: true });
        });
        return true;

      case 'STOP_RECORDING':
        manager.stopRecording().then((session) => {
          sendResponse({ success: true, session });
        });
        return true;

      case 'TOGGLE_INSPECTOR':
        manager.toggleInspector(message.tabId).then((enabled) => {
          sendResponse({ success: true, isInspecting: enabled });
        });
        return true;

      case 'INSPECTOR_STATE_CHANGED':
        manager.setInspectorState(Boolean(message.enabled)).then(() => {
          sendResponse({ success: true });
        });
        return true;

      case 'RECORD_EVENT':
        manager.recordEvent(message.event, tabId).then(() => {
          sendResponse({ success: true });
        });
        return true;

      case 'START_REPLAY':
        manager.startReplay(message.session, message.tabId).then(() => {
          sendResponse({ success: true });
        });
        return true;

      case 'CONTENT_READY_FOR_NEXT_STEP':
        if (tabId) {
          manager.scheduleNextReplayStep(tabId, 250);
          sendResponse({ success: true });
        }
        break;

      default:
        break;
    }
    return false;
  });

  // Watch tab updates / navigation to resume replay or re-inject MAIN world script
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'complete') {
      manager.getState().then((state) => {
        if (state.status === 'RECORDING' && state.activeTabId === tabId) {
          if (chrome.scripting) {
            chrome.scripting.executeScript({
              target: { tabId },
              world: 'MAIN',
              files: ['injected.js']
            }).catch(() => {});
          }
        } else if (state.status === 'REPLAYING' && state.activeTabId === tabId) {
          // Debounced step scheduler guarantees DOM & hydration settled before step runs
          manager.scheduleNextReplayStep(tabId, 400);
        }
      });
    }
  });

  // Listen for keyboard command toggle-inspector from manifest
  chrome.commands?.onCommand?.addListener((command) => {
    if (command === 'toggle-inspector') {
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          manager.toggleInspector(tabs[0].id);
        } else {
          manager.toggleInspector();
        }
      });
    }
  });
}
