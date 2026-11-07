import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ServiceWorkerStateManager } from '../src/background/service-worker';
import { ActionEvent, NavigationEvent } from '../src/types/schema';

describe('Navigation & Refresh State Persistence', () => {
  let memoryStorage: Record<string, any>;
  let mockStorage: any;
  let badge: { text: string; color: string };
  let mockAction: any;
  let mockTabs: any;

  beforeEach(() => {
    memoryStorage = {};
    badge = { text: '', color: '' };

    mockStorage = {
      get: vi.fn((keys: any, cb: (res: any) => void) => {
        const res: Record<string, any> = {};
        const keyList = Array.isArray(keys) ? keys : [keys];
        keyList.forEach(k => { res[k] = memoryStorage[k]; });
        cb(res);
      }),
      set: vi.fn((items: any, cb?: () => void) => {
        Object.assign(memoryStorage, items);
        if (cb) cb();
      }),
      remove: vi.fn((keys: any, cb?: () => void) => {
        const keyList = Array.isArray(keys) ? keys : [keys];
        keyList.forEach(k => { delete memoryStorage[k]; });
        if (cb) cb();
      })
    };

    mockAction = {
      setBadgeText: vi.fn((d: { text: string }) => { badge.text = d.text; }),
      setBadgeBackgroundColor: vi.fn((d: { color: string }) => { badge.color = d.color; })
    };

    mockTabs = {
      sendMessage: vi.fn().mockResolvedValue({ success: true }),
      update: vi.fn().mockResolvedValue({}),
      query: vi.fn((opts, cb) => cb([{ id: 101, active: true }]))
    };
  });

  it('restores badge correctly to action count on service worker wakeup when recording', async () => {
    // 1. Initial SW starts recording and records 2 actions
    const sw1 = new ServiceWorkerStateManager(mockStorage, mockAction, mockTabs);
    await sw1.startRecording(101, 'https://app.com/page1');
    await sw1.recordEvent({
      id: 'e1', category: 'action', type: 'click', timestamp: 100, url: 'https://app.com/page1',
      selectors: { tag: 'button' }
    }, 101);
    await sw1.recordEvent({
      id: 'e2', category: 'action', type: 'click', timestamp: 110, url: 'https://app.com/page1',
      selectors: { tag: 'a', text: 'Go to Page 2' }
    }, 101);

    expect(badge.text).toBe('2');

    // 2. Simulate Service Worker restart on navigation/wakeup
    const sw2 = new ServiceWorkerStateManager(mockStorage, mockAction, mockTabs);
    await sw2.whenReady();

    const state = await sw2.getState();
    expect(state.status).toBe('RECORDING');
    expect(state.currentSession?.events.length).toBe(2);
    // Badge MUST be restored to '2' (not wiped to empty string '')!
    expect(badge.text).toBe('2');
  });

  it('records navigation events when web page navigates to a new URL', async () => {
    const sw = new ServiceWorkerStateManager(mockStorage, mockAction, mockTabs);
    await sw.startRecording(101, 'https://app.com/page1');

    await sw.recordEvent({
      id: 'e1', category: 'action', type: 'click', timestamp: 100, url: 'https://app.com/page1',
      selectors: { tag: 'a', text: 'Dashboard' }
    }, 101);

    // Record navigation event from page1 to page2
    await sw.recordNavigation(101, 'https://app.com/page1', 'https://app.com/dashboard');

    const state = await sw.getState();
    const events = state.currentSession?.events || [];
    expect(events.length).toBe(2);
    expect(events[1].category).toBe('navigation');
    expect((events[1] as NavigationEvent).toUrl).toBe('https://app.com/dashboard');
  });

  it('transfers active recording tab when a link opens in a new tab target', async () => {
    const sw = new ServiceWorkerStateManager(mockStorage, mockAction, mockTabs);
    await sw.startRecording(101, 'https://app.com/page1');

    // Link opens in new tab 102
    await sw.handleTabTargetCreated(101, 102, 'https://app.com/new-window');

    const state = await sw.getState();
    expect(state.activeTabId).toBe(102);

    // Event from tab 102 should now be accepted
    await sw.recordEvent({
      id: 'e3', category: 'action', type: 'click', timestamp: 200, url: 'https://app.com/new-window',
      selectors: { tag: 'button' }
    }, 102);

    expect((await sw.getState()).currentSession?.events.length).toBe(2); // navigation + click
  });
});
