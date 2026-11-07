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
    expect(manager.getState().status).toBe('RECORDING');
    expect(manager.getState().activeTabId).toBe(101);
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

    expect(manager.getState().currentSession?.events.length).toBe(1);
    expect(mockBadge.text).toBe('1');

    // Ignores event from different tabId
    const action2: ActionEvent = {
      id: '2', category: 'action', type: 'click', timestamp: 200, url: 'https://other.com',
      selectors: { tag: 'button', css: 'button' }
    };
    await manager.recordEvent(action2, 999);
    expect(manager.getState().currentSession?.events.length).toBe(1);
  });

  it('stops recording and saves final session', async () => {
    await manager.startRecording(101, 'https://app.example.com', 'Mozilla/5.0', { width: 1920, height: 1080 });
    const session = await manager.stopRecording();

    expect(manager.getState().status).toBe('IDLE');
    expect(session.metadata.endedAt).toBeDefined();
    expect(mockBadge.text).toBe('');
    expect(mockStorage['wat_last_session']).toEqual(session);
  });
});
