export interface ScreenshotArtifact {
  id: string;
  timestamp: number;
  trigger: 'error_network' | 'error_console' | 'manual';
  dataUrl: string;
  url: string;
  label?: string;
}

export interface EnvironmentMetadata {
  os?: string;
  browser?: string;
  screenResolution?: { width: number; height: number };
  viewport: { width: number; height: number };
  devicePixelRatio?: number;
  language?: string;
  online?: boolean;
}

export interface RecordedSession {
  sessionId: string;
  metadata: {
    startUrl: string;
    userAgent: string;
    viewport: { width: number; height: number };
    startedAt: number;
    endedAt?: number;
    environment?: EnvironmentMetadata;
  };
  events: TrackedEvent[];
  screenshots?: ScreenshotArtifact[];
}

export type TrackedEvent = 
  | ActionEvent 
  | NetworkEvent 
  | ConsoleEvent 
  | NavigationEvent;

export interface ElementHandlerMetadata {
  name?: string;
  raw?: string;
  source?: 'inline' | 'react' | 'vue' | 'listener' | 'attribute';
  componentName?: string;
  props?: Record<string, any>;
}

export interface ElementSelectors {
  tag: string;
  testId?: string;
  id?: string;
  role?: string;
  name?: string;
  text?: string;
  classes?: string[];
  css: string;
}

export interface ActionEvent {
  id: string;
  category: 'action';
  type: 'click' | 'input' | 'change' | 'keydown';
  timestamp: number;
  url: string;
  selectors: ElementSelectors;
  value?: string;           // Masked if sensitive
  key?: string;             // For keydown (e.g. 'Enter', 'Tab')
  isSensitive?: boolean;
  handler?: ElementHandlerMetadata;
}

export interface NetworkEvent {
  id: string;
  category: 'network';
  type: 'fetch' | 'xhr';
  timestamp: number;
  url: string;
  method: string;
  requestUrl: string;
  status: number;
  durationMs: number;
  requestPayload?: string;
  responsePreview?: string;
  error?: string;
}

export interface ConsoleEvent {
  id: string;
  category: 'console';
  level: 'error' | 'warn';
  timestamp: number;
  url: string;
  message: string;
  stackTrace?: string;
}

export interface NavigationEvent {
  id: string;
  category: 'navigation';
  type?: 'pushState' | 'replaceState' | 'popstate' | 'reload';
  timestamp: number;
  fromUrl: string;
  toUrl: string;
}

export type ExtensionStatus = 'IDLE' | 'RECORDING' | 'REPLAYING' | 'REPLAY_PAUSED_WAITING_INPUT';

export interface ExtensionState {
  status: ExtensionStatus;
  isInspecting: boolean;
  activeTabId?: number;
  currentSession?: RecordedSession;
  replayingStepIndex?: number;
}

export function isActionEvent(event: TrackedEvent): event is ActionEvent {
  return event.category === 'action';
}

export function isNetworkEvent(event: TrackedEvent): event is NetworkEvent {
  return event.category === 'network';
}

export function isConsoleEvent(event: TrackedEvent): event is ConsoleEvent {
  return event.category === 'console';
}

export function isNavigationEvent(event: TrackedEvent): event is NavigationEvent {
  return event.category === 'navigation';
}

export function createNewSession(
  startUrl: string,
  userAgent: string,
  viewport: { width: number; height: number },
  environment?: EnvironmentMetadata
): RecordedSession {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 7);
  return {
    sessionId: `rec_${timestamp}_${randomSuffix}`,
    metadata: {
      startUrl,
      userAgent,
      viewport,
      startedAt: timestamp,
      environment
    },
    events: [],
    screenshots: []
  };
}
