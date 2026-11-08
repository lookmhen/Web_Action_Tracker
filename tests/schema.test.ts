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
  NavigationEvent,
  ScreenshotArtifact,
  EnvironmentMetadata,
  ElementHandlerMetadata
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

  it('validates ScreenshotArtifact and EnvironmentMetadata structures', () => {
    const artifact: ScreenshotArtifact = {
      id: 'shot_1',
      timestamp: 1000,
      trigger: 'error_network',
      dataUrl: 'data:image/jpeg;base64,mockdata',
      url: 'https://app.com',
      label: 'API failure'
    };
    expect(artifact.trigger).toBe('error_network');
    expect(artifact.dataUrl).toContain('data:image/jpeg;base64');

    const env: EnvironmentMetadata = {
      os: 'Windows',
      browser: 'Chrome 130',
      viewport: { width: 1920, height: 1080 },
      screenResolution: { width: 2560, height: 1440 },
      devicePixelRatio: 1.25,
      language: 'en-US',
      online: true
    };
    expect(env.os).toBe('Windows');
    expect(env.devicePixelRatio).toBe(1.25);
  });

  it('validates ElementHandlerMetadata and ActionEvent.handler', () => {
    const handler: ElementHandlerMetadata = {
      name: 'handleCheckout',
      raw: 'handleCheckout()',
      source: 'react',
      componentName: 'OrderButton',
      props: { orderId: 'ORD-123', total: 450 }
    };
    const action: ActionEvent = {
      id: 'act_handler_1',
      category: 'action',
      type: 'click',
      timestamp: 200,
      url: 'https://app.com',
      selectors: { tag: 'button', css: '#btn-checkout' },
      handler
    };

    expect(action.handler).toBeDefined();
    expect(action.handler?.name).toBe('handleCheckout');
    expect(action.handler?.componentName).toBe('OrderButton');
    expect(action.handler?.props?.orderId).toBe('ORD-123');
    expect(action.handler?.source).toBe('react');
  });
});
