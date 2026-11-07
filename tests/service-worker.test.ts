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
});
