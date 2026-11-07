import { describe, it, expect } from 'vitest';
import {
  isActionEvent,
  isNetworkEvent,
  isConsoleEvent,
  isNavigationEvent,
  createNewSession,
  ActionEvent,
  NetworkEvent,
  ConsoleEvent,
  NavigationEvent
} from '../src/types/schema';

describe('Data Schema & Type Guards', () => {
  it('correctly categorizes events with type guards', () => {
    const action: ActionEvent = {
      id: '1',
      category: 'action',
      type: 'click',
      timestamp: 100,
      url: 'http://a.com',
      selectors: { tag: 'button', css: 'button' }
    };
    const network: NetworkEvent = {
      id: '2',
      category: 'network',
      type: 'fetch',
      timestamp: 101,
      url: 'http://a.com',
      method: 'POST',
      requestUrl: 'http://api.a.com/data',
      status: 500,
      durationMs: 250
    };
    const consoleEvt: ConsoleEvent = {
      id: '3',
      category: 'console',
      level: 'error',
      timestamp: 102,
      url: 'http://a.com',
      message: 'Uncaught error'
    };
    const nav: NavigationEvent = {
      id: '4',
      category: 'navigation',
      type: 'reload',
      timestamp: 103,
      fromUrl: 'http://a.com/old',
      toUrl: 'http://a.com/new'
    };

    expect(isActionEvent(action)).toBe(true);
    expect(isNetworkEvent(action)).toBe(false);

    expect(isNetworkEvent(network)).toBe(true);
    expect(isConsoleEvent(network)).toBe(false);

    expect(isConsoleEvent(consoleEvt)).toBe(true);
    expect(isNavigationEvent(consoleEvt)).toBe(false);

    expect(isNavigationEvent(nav)).toBe(true);
    expect(isActionEvent(nav)).toBe(false);
  });

  it('creates an initialized session with metadata', () => {
    const session = createNewSession('https://app.example.com', 'Mozilla/5.0', { width: 1920, height: 1080 });
    expect(session.sessionId).toMatch(/^rec_\d+_/);
    expect(session.events).toEqual([]);
    expect(session.metadata.startUrl).toBe('https://app.example.com');
    expect(session.metadata.viewport).toEqual({ width: 1920, height: 1080 });
    expect(typeof session.metadata.startedAt).toBe('number');
  });
});
