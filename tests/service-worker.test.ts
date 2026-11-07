import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ServiceWorkerStateManager } from '../src/background/service-worker';
import { ActionEvent } from '../src/types/schema';

describe('Service Worker State Manager', () => {
  let manager: ServiceWorkerStateManager;
  let mockStorage: Record<string, any>;
  let mockBadge: { text: string; color: string };

  beforeEach(() => {
    mockStorage = {};
    mockBadge = { text: '', color: '' };

    const storageArea = {
      get: vi.fn((keys: any, cb: (res: any) => void) => {
        if (typeof keys === 'string') {
          cb({ [keys]: mockStorage[keys] });
        } else if (Array.isArray(keys)) {
          const res: Record<string, any> = {};
          keys.forEach(k => { res[k] = mockStorage[k]; });
          cb(res);
        } else {
          cb(mockStorage);
        }
      }),
      set: vi.fn((items: any, cb?: () => void) => {
        Object.assign(mockStorage, items);
        if (cb) cb();
      }),
      remove: vi.fn((keys: any, cb?: () => void) => {
        const keyArr = Array.isArray(keys) ? keys : [keys];
        keyArr.forEach(k => delete mockStorage[k]);
        if (cb) cb();
      })
    };

    const actionApi = {
      setBadgeText: vi.fn((details: { text: string }) => { mockBadge.text = details.text; }),
      setBadgeBackgroundColor: vi.fn((details: { color: string }) => { mockBadge.color = details.color; })
    };

    const tabsApi = {
      update: vi.fn(),
      sendMessage: vi.fn().mockResolvedValue({ success: true })
    };

    manager = new ServiceWorkerStateManager(storageArea as any, actionApi as any, tabsApi as any);
  });

  it('starts recording and updates state and badge', async () => {
    await manager.startRecording(101, 'https://app.example.com', 'Mozilla/5.0', { width: 1920, height: 1080 });
    const state = await manager.getState();
    expect(state.status).toBe('RECORDING');
    expect(state.activeTabId).toBe(101);
    expect(mockBadge.text).toBe('REC');
    expect(mockStorage['wat_state']?.status).toBe('RECORDING');
  });

  it('appends events and updates badge step counter during recording', async () => {
    await manager.startRecording(101, 'https://app.example.com', 'Mozilla/5.0', { width: 1920, height: 1080 });

    const action1: ActionEvent = {
      id: '1', category: 'action', type: 'click', timestamp: 100, url: 'https://app.example.com',
      selectors: { tag: 'button', css: 'button' }
    };
    await manager.recordEvent(action1, 101);

    expect((await manager.getState()).currentSession?.events.length).toBe(1);
    expect(mockBadge.text).toBe('1');

    // Ignores event from different tabId
    const action2: ActionEvent = {
      id: '2', category: 'action', type: 'click', timestamp: 200, url: 'https://other.com',
      selectors: { tag: 'button', css: 'button' }
    };
    await manager.recordEvent(action2, 999);
    expect((await manager.getState()).currentSession?.events.length).toBe(1);
  });

  it('stops recording and saves final session', async () => {
    await manager.startRecording(101, 'https://app.example.com', 'Mozilla/5.0', { width: 1920, height: 1080 });
    const session = await manager.stopRecording();

    expect((await manager.getState()).status).toBe('IDLE');
    expect(session.metadata.endedAt).toBeDefined();
    expect(mockBadge.text).toBe('');
    expect(mockStorage['wat_last_session']).toEqual(session);
  });

  it('awaits storage restoration on service worker wakeup before recording event', async () => {
    let delayedStorageCb: any;
    const delayedStorage = {
      get: vi.fn((keys: any, cb: any) => {
        delayedStorageCb = () => cb({
          wat_state: { status: 'RECORDING', isInspecting: false, activeTabId: 101 },
          wat_current_session: {
            sessionId: 'rec_wake',
            metadata: { startUrl: 'https://app.com', userAgent: 'Chrome', viewport: { width: 1000, height: 800 }, startedAt: 100 },
            events: []
          }
        });
      }),
      set: vi.fn((items: any, cb?: () => void) => { cb && cb(); })
    };

    const sw = new ServiceWorkerStateManager(delayedStorage as any);
    // Simulate event arrives before storage callback finished
    const eventPromise = sw.recordEvent({
      id: 'e1', category: 'action', type: 'click', timestamp: 102, url: 'https://app.com',
      selectors: { tag: 'button', css: 'button' }
    }, 101);

    // Now trigger storage restoration callback
    delayedStorageCb();
    await eventPromise;

    expect((await sw.getState()).currentSession?.events.length).toBe(1);
  });

  it('debounces and coordinates replay step execution to prevent double execution', async () => {
    const session: RecordedSession = {
      sessionId: 'rec_replay_sync',
      metadata: { startUrl: 'https://app.com', userAgent: 'Chrome', viewport: { width: 1000, height: 800 }, startedAt: 100 },
      events: [
        { id: '1', category: 'action', type: 'click', timestamp: 101, url: 'https://app.com', selectors: { tag: 'button', css: 'button' } }
      ]
    };

    let stepCallCount = 0;
    const tabsMock = {
      update: vi.fn(),
      sendMessage: vi.fn().mockImplementation(() => {
        stepCallCount++;
        return Promise.resolve({ success: true });
      })
    };

    const sw = new ServiceWorkerStateManager({ get: vi.fn((k, cb) => cb({})), set: vi.fn((i, cb) => cb && cb()) } as any, undefined, tabsMock as any);
    await sw.startReplay(session, 101);

    // Call scheduleNextReplayStep twice in quick succession (simulating tabs.onUpdated + CONTENT_READY_FOR_NEXT_STEP)
    sw.scheduleNextReplayStep(101, 50);
    sw.scheduleNextReplayStep(101, 50);

    await new Promise(r => setTimeout(r, 120));

    // Must execute only once
    expect(stepCallCount).toBe(1);
  });

  it('queries active tab in lastFocusedWindow when toggleInspector called with no tabId and not recording', async () => {
    let queriedOptions: any;
    const tabsMock = {
      query: vi.fn((opts: any, cb: (res: any) => void) => {
        queriedOptions = opts;
        cb([{ id: 777, active: true }]);
      }),
      sendMessage: vi.fn().mockResolvedValue({ success: true, enabled: true })
    };

    const sw = new ServiceWorkerStateManager({ get: vi.fn((k, cb) => cb({})), set: vi.fn((i, cb) => cb && cb()) } as any, undefined, tabsMock as any);
    await sw.whenReady();

    const isInspecting = await sw.toggleInspector();
    expect(isInspecting).toBe(true);
    expect(tabsMock.query).toHaveBeenCalled();
    expect(queriedOptions).toEqual({ active: true, lastFocusedWindow: true });
    expect(tabsMock.sendMessage).toHaveBeenCalledWith(777, { type: 'SET_INSPECTOR', enabled: true });

    // Immediate second call within 100ms is debounced to prevent double-toggle
    const debouncedState = await sw.toggleInspector();
    expect(debouncedState).toBe(true);

    // Advance time beyond 500ms debounce window to turn it OFF
    await new Promise(r => setTimeout(r, 550));
    const isInspectingOff = await sw.toggleInspector();
    expect(isInspectingOff).toBe(false);
    expect(tabsMock.sendMessage).toHaveBeenLastCalledWith(777, { type: 'SET_INSPECTOR', enabled: false });
  });

  it('attempts dynamic injection of content.js if tab sendMessage fails on toggleInspector', async () => {
    const tabsMock = {
      sendMessage: vi.fn()
        .mockRejectedValueOnce(new Error('Receiving end does not exist'))
        .mockResolvedValueOnce({ success: true, enabled: true })
    };

    // Mock chrome.scripting
    const mockExecuteScript = vi.fn().mockResolvedValue([]);
    (globalThis as any).chrome = {
      scripting: {
        executeScript: mockExecuteScript
      }
    };

    const sw = new ServiceWorkerStateManager({ get: vi.fn((k, cb) => cb({})), set: vi.fn((i, cb) => cb && cb()) } as any, undefined, tabsMock as any);
    await sw.whenReady();

    await sw.toggleInspector(888);

    expect(mockExecuteScript).toHaveBeenCalledWith({
      target: { tabId: 888 },
      files: ['content.js']
    });
  });
});
