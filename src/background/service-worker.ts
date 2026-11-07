import { ExtensionState, ExtensionStatus, RecordedSession, TrackedEvent, createNewSession, isActionEvent } from '../types/schema';

export class ServiceWorkerStateManager {
  private state: ExtensionState;
  private storage: chrome.storage.StorageArea;
  private actionApi?: typeof chrome.action;
  private tabsApi?: typeof chrome.tabs;

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

    // Restore state from storage if exists
    this.storage.get(['wat_state', 'wat_current_session'], (items) => {
      if (items?.wat_state) {
        this.state = items.wat_state;
      }
      if (items?.wat_current_session) {
        this.state.currentSession = items.wat_current_session;
      }
      this.updateBadge();
    });
  }

  public getState(): ExtensionState {
    return { ...this.state };
  }

  public async startRecording(
    tabId: number,
    startUrl: string,
    userAgent = 'Chrome',
    viewport = { width: 1920, height: 1080 }
  ): Promise<void> {
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

  public async toggleInspector(tabId?: number): Promise<boolean> {
    this.state.isInspecting = !this.state.isInspecting;
    await this.persist();

    const targetTabId = tabId || this.state.activeTabId;
    if (targetTabId && this.tabsApi?.sendMessage) {
      this.tabsApi.sendMessage(targetTabId, { type: 'TOGGLE_INSPECTOR' }).catch(() => {});
    }

    return this.state.isInspecting;
  }

  public async startReplay(session: RecordedSession, tabId: number): Promise<void> {
    const actions = session.events.filter(isActionEvent);
    if (actions.length === 0) return;

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

    // Check if tab needs navigation to startUrl
    if (this.tabsApi?.update && session.metadata.startUrl) {
      this.tabsApi.update(tabId, { url: session.metadata.startUrl });
    } else if (this.tabsApi?.sendMessage) {
      this.executeNextReplayStep(tabId);
    }
  }

  public async executeNextReplayStep(tabId: number): Promise<void> {
    if (this.state.status !== 'REPLAYING' || !this.state.currentSession) return;

    const actions = this.state.currentSession.events.filter(isActionEvent);
    const index = this.state.replayingStepIndex ?? 0;

    if (index >= actions.length) {
      // Replay finished
      this.stopReplay();
      return;
    }

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

        if (response?.success) {
          // Continue to next action after delay
          setTimeout(() => {
            this.executeNextReplayStep(tabId);
          }, 350);
        } else {
          console.warn('Replay step halted:', response?.error);
        }
      } catch (err) {
        console.warn('Tab navigation or communication delay during replay:', err);
      }
    }
  }

  public async stopReplay(): Promise<void> {
    this.state.status = 'IDLE';
    this.state.replayingStepIndex = undefined;
    await this.storage.remove(['wat_replay_queue', 'wat_replay_step']);
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
        sendResponse(manager.getState());
        break;

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
          manager.executeNextReplayStep(tabId);
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
      const state = manager.getState();
      if (state.status === 'RECORDING' && state.activeTabId === tabId) {
        if (chrome.scripting) {
          chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            files: ['injected.js']
          }).catch(() => {});
        }
      } else if (state.status === 'REPLAYING' && state.activeTabId === tabId) {
        setTimeout(() => {
          manager.executeNextReplayStep(tabId);
        }, 500);
      }
    }
  });

  // Listen for keyboard command toggle-inspector from manifest
  chrome.commands?.onCommand?.addListener((command) => {
    if (command === 'toggle-inspector') {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          manager.toggleInspector(tabs[0].id);
        }
      });
    }
  });
}
