import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ServiceWorkerStateManager } from '../src/background/service-worker';
import { ActionEvent, NetworkEvent, ConsoleEvent, RecordedSession } from '../src/types/schema';

describe('Service Worker State Manager', () => {
  let manager: ServiceWorkerStateManager;
  let mockStorage: Record<string, any>;
  let mockBadge: { text: string; color: string };
  let mockTabsApi: any;

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

    mockTabsApi = {
      update: vi.fn(),
      sendMessage: vi.fn().mockResolvedValue({ success: true }),
      get: vi.fn().mockImplementation((tabId: number, cb?: (tab: any) => void) => {
        const tab = { id: tabId, windowId: 1, active: true, url: 'https://app.example.com' };
        if (cb) cb(tab);
        return Promise.resolve(tab);
      }),
      captureVisibleTab: vi.fn().mockImplementation((winId: any, opts: any, cb?: (res: string) => void) => {
        const res = 'data:image/jpeg;base64,mockjpegdata';
        if (cb) cb(res);
        return Promise.resolve(res);
      })
    };

    manager = new ServiceWorkerStateManager(storageArea as any, actionApi as any, mockTabsApi as any);
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
    const eventPromise = sw.recordEvent({
      id: 'e1', category: 'action', type: 'click', timestamp: 102, url: 'https://app.com',
      selectors: { tag: 'button', css: 'button' }
    }, 101);

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

    sw.scheduleNextReplayStep(101, 50);
    sw.scheduleNextReplayStep(101, 50);

    await new Promise(r => setTimeout(r, 120));

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

    const debouncedState = await sw.toggleInspector();
    expect(debouncedState).toBe(true);

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

  it('captures compressed JPEG screenshot only when tab is active and respects ceiling', async () => {
    await manager.startRecording(101, 'https://app.example.com');

    const shot1 = await manager.captureScreenshot('manual', 101, 'Step 1');
    expect(shot1).toBeDefined();
    expect(shot1?.trigger).toBe('manual');
    expect(shot1?.dataUrl).toContain('data:image/jpeg;base64');
    expect((await manager.getState()).currentSession?.screenshots?.length).toBe(1);

    // Tab inactive -> skips capture for privacy
    mockTabsApi.get.mockImplementationOnce((tabId: number, cb?: (tab: any) => void) => {
      const tab = { id: 101, windowId: 1, active: false, url: 'https://app.example.com' };
      if (cb) cb(tab);
      return Promise.resolve(tab);
    });

    const shot2 = await manager.captureScreenshot('error_console', 101);
    expect(shot2).toBeNull();
    expect((await manager.getState()).currentSession?.screenshots?.length).toBe(1);

    // Respects ceiling of 15 screenshots
    const currentSession = (await manager.getState()).currentSession!;
    for (let i = 1; i < 15; i++) {
      currentSession.screenshots!.push({
        id: `shot_${i}`,
        timestamp: Date.now(),
        trigger: 'manual',
        dataUrl: 'data:image/jpeg;base64,mock',
        url: 'https://app.example.com'
      });
    }
    expect(currentSession.screenshots?.length).toBe(15);

    const shotOverLimit = await manager.captureScreenshot('manual', 101);
    expect(shotOverLimit).toBeNull();
    expect((await manager.getState()).currentSession?.screenshots?.length).toBe(15);
  });

  it('purges previous screenshots completely when new recording begins', async () => {
    await manager.startRecording(101, 'https://app.example.com');
    await manager.captureScreenshot('manual', 101);
    expect((await manager.getState()).currentSession?.screenshots?.length).toBe(1);

    // Start new recording purges old screenshots
    await manager.startRecording(101, 'https://app.example.com/new');
    expect((await manager.getState()).currentSession?.screenshots?.length).toBe(0);
  });

  it('clears session events and screenshots on clearSession', async () => {
    await manager.startRecording(101, 'https://app.example.com');
    await manager.recordEvent({
      id: 'e1', category: 'action', type: 'click', timestamp: 100, url: 'https://app.com',
      selectors: { tag: 'button', css: 'button' }
    }, 101);
    await manager.captureScreenshot('manual', 101);

    expect((await manager.getState()).currentSession?.events.length).toBe(1);
    expect((await manager.getState()).currentSession?.screenshots?.length).toBe(1);

    await manager.clearSession();

    const state = await manager.getState();
    expect(state.currentSession?.events.length).toBe(0);
    expect(state.currentSession?.screenshots?.length).toBe(0);
  });

  it('auto-triggers screenshot on network or console error with debounce', async () => {
    await manager.startRecording(101, 'https://app.example.com');

    const netErr: NetworkEvent = {
      id: 'net_1',
      category: 'network',
      type: 'fetch',
      timestamp: 100,
      url: 'https://app.example.com',
      method: 'POST',
      requestUrl: 'https://api.example.com/data',
      status: 500,
      durationMs: 50
    };

    await manager.recordEvent(netErr, 101);
    expect((await manager.getState()).currentSession?.screenshots?.length).toBe(1);
    expect((await manager.getState()).currentSession?.screenshots?.[0].trigger).toBe('error_network');

    // Immediate second error within 1000ms is debounced
    const consoleErr: ConsoleEvent = {
      id: 'err_1',
      category: 'console',
      level: 'error',
      timestamp: 150,
      url: 'https://app.example.com',
      message: 'Uncaught TypeError'
    };
    await manager.recordEvent(consoleErr, 101);
    expect((await manager.getState()).currentSession?.screenshots?.length).toBe(1);
  });
});
