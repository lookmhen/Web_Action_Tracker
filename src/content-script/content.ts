import { ActionEvent, TrackedEvent } from '../types/schema';
import { resolveElementSelectors } from '../utils/selectors';
import { isSensitiveInput, maskValue } from '../utils/masking';
import { createInspector, InspectorController } from './inspector';
import { executeReplayStep, startReplayRunner } from './replay';

let isRecording = false;
let inspector: InspectorController | null = null;

export function handleDomEvent(
  event: Event,
  sendCallback: (action: ActionEvent) => void
): ActionEvent | null {
  const target = event.target as HTMLElement | null;
  if (!target || target.nodeType !== Node.ELEMENT_NODE) return null;

  // Ignore extension internal overlay elements
  let el: HTMLElement | null = target;
  while (el && el !== document.body) {
    if (el.id?.startsWith('__wat_')) {
      return null;
    }
    el = el.parentElement;
  }

  const eventType = event.type;
  if (eventType !== 'click' && eventType !== 'input' && eventType !== 'change' && eventType !== 'keydown') {
    return null;
  }

  // Filter keydown to only record Enter, Tab, Escape or special keys
  let key: string | undefined = undefined;
  if (eventType === 'keydown') {
    const kEvent = event as KeyboardEvent;
    if (kEvent.key === 'Enter' || kEvent.key === 'Tab' || kEvent.key === 'Escape') {
      key = kEvent.key;
    } else {
      return null;
    }
  }

  const selectors = resolveElementSelectors(target);
  const sensitive = isSensitiveInput(target);
  let value: string | undefined = undefined;

  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
    value = sensitive ? maskValue(target.value) : target.value;
  }

  const actionEvent: ActionEvent = {
    id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    category: 'action',
    type: eventType as ActionEvent['type'],
    timestamp: Date.now(),
    url: window.location.href,
    selectors,
    value,
    key,
    isSensitive: sensitive
  };

  sendCallback(actionEvent);
  return actionEvent;
}

export function handleTelemetryMessage(
  event: MessageEvent,
  sendCallback: (telemetryEvent: TrackedEvent) => void
): void {
  if (event.data && event.data.source === '__WAT_TELEMETRY__') {
    sendCallback(event.data.event);
  }
}

function sendToServiceWorker(event: TrackedEvent) {
  try {
    if (chrome?.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        type: 'RECORD_EVENT',
        event
      });
    }
  } catch {
    // Fail-safe if extension context invalidated
  }
}

// Input debounce map
const inputDebounceTimers = new Map<Element, number>();

export function flushPendingInputs(): void {
  for (const [target, timer] of inputDebounceTimers.entries()) {
    window.clearTimeout(timer);
    const syntheticEvent = new Event('input', { bubbles: true });
    Object.defineProperty(syntheticEvent, 'target', { value: target });
    handleDomEvent(syntheticEvent, sendToServiceWorker);
  }
  inputDebounceTimers.clear();
}

export function setupContentScript(): void {
  if (typeof window === 'undefined') return;

  // If a previous inspector instance was running, disable it cleanly first
  if ((window as any).__wat_inspector_instance__) {
    try {
      ((window as any).__wat_inspector_instance__).disable();
    } catch {}
  }
  document.getElementById('__wat_inspector_box__')?.remove();
  document.getElementById('__wat_inspector_card__')?.remove();
  document.getElementById('__wat_inspector_toast__')?.remove();

  inspector = createInspector();
  (window as any).__wat_inspector_instance__ = inspector;

  // Prevent duplicate event listener accumulation on the window
  if ((window as any).__WAT_CONTENT_SCRIPT_INITIALIZED__) {
    return;
  }
  (window as any).__WAT_CONTENT_SCRIPT_INITIALIZED__ = true;

  // Listen for DOM events in capture phase
  const eventTypes = ['click', 'input', 'change', 'keydown'];
  for (const type of eventTypes) {
    window.addEventListener(
      type,
      (e) => {
        if (!isRecording) return;

        if (type === 'input') {
          const target = e.target as Element;
          if (inputDebounceTimers.has(target)) {
            window.clearTimeout(inputDebounceTimers.get(target));
          }
          const timer = window.setTimeout(() => {
            handleDomEvent(e, sendToServiceWorker);
            inputDebounceTimers.delete(target);
          }, 300);
          inputDebounceTimers.set(target, timer);
        } else {
          // Flush any pending debounced inputs first to maintain chronological step order
          if (type === 'click' || type === 'keydown') {
            flushPendingInputs();
          }
          handleDomEvent(e, sendToServiceWorker);
        }
      },
      true // capture phase
    );
  }

  // Listen for telemetry from MAIN world injected.js
  window.addEventListener('message', (e) => {
    if (!isRecording) return;
    handleTelemetryMessage(e, sendToServiceWorker);
  });

  // Listen for runtime commands from service worker or popup
  if (chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      switch (message.type) {
        case 'STATUS_CHANGE':
          isRecording = message.status === 'RECORDING';
          sendResponse({ success: true, isRecording });
          break;

        case 'SET_INSPECTOR':
          if (inspector) {
            if (message.enabled) {
              inspector.enable();
            } else {
              inspector.disable();
            }
            sendResponse({ success: true, enabled: inspector.isEnabled() });
          }
          break;

        case 'TOGGLE_INSPECTOR':
          if (inspector) {
            const nextState = message.enabled !== undefined ? message.enabled : !inspector.isEnabled();
            if (nextState) {
              inspector.enable();
            } else {
              inspector.disable();
            }
            sendResponse({ success: true, enabled: inspector.isEnabled() });
          }
          break;

        case 'EXECUTE_REPLAY_STEP':
          executeReplayStep(message.action)
            .then((result) => sendResponse(result))
            .catch((err) => sendResponse({ success: false, error: err.message }));
          return true; // async response

        case 'START_REPLAY':
          startReplayRunner(message.session)
            .then((result) => sendResponse(result))
            .catch((err) => sendResponse({ success: false, error: err.message }));
          return true; // async response

        default:
          break;
      }
      return false;
    });
  }

  // Check initial state from service worker / storage
  if (chrome?.storage?.local) {
    chrome.storage.local.get(['wat_state', 'wat_replay_queue'], (items) => {
      if (items.wat_state?.status === 'RECORDING') {
        isRecording = true;
      }

      // Check if resuming replay after page reload
      if (items.wat_replay_queue && items.wat_state?.status === 'REPLAYING') {
        const checkReady = () => {
          if (document.readyState === 'complete') {
            chrome.runtime.sendMessage({ type: 'CONTENT_READY_FOR_NEXT_STEP' });
          } else {
            window.addEventListener('load', () => {
              chrome.runtime.sendMessage({ type: 'CONTENT_READY_FOR_NEXT_STEP' });
            });
          }
        };
        checkReady();
      }
    });
  }
}

// Auto-run when in browser
if (typeof window !== 'undefined' && typeof process === 'undefined') {
  setupContentScript();
}
