# Web Action Tracker, Bug Replay & Element Inspector Extension (Revision 1.2)
## Technical Design Specification

### 1. Intent and Why
Web debugging and QA bug reporting often suffer from incomplete steps to reproduce, missing network logs, lost console exceptions, and repetitive manual testing. 

This Chrome Extension (Manifest V3) bridges the gap between Users/QA, Support, and Developers by providing:
1. Automated recording of user interactions, network failures (4xx/5xx), and console errors.
2. An interactive Live Element Inspector with floating tooltips and click-to-copy selectors.
3. An In-Browser Replay Engine resilient to Single Page Applications (React/Vue synthetic events) and full-page reloads.
4. A Triple-Format Export Engine producing:
   - Human-Readable Markdown reports for tickets (Jira, GitHub).
   - Machine-Executable Playwright test scripts (`.spec.ts`) for engineers.
   - Raw JSON Session Dumps for portable replay and internal tooling.
5. A JSON Session Importer to reload external session dumps back into the extension for immediate in-browser replay.

---

### 2. Goals, Non-Goals, and Anti-Goals

#### Goals
- **High-Fidelity Action Recording:** Capture clicks, inputs, changes, and keydowns (Enter, Tab, etc.) in capture phase without interfering with page logic.
- **Automatic Failure Detection:** Intercept Fetch/XHR failures (HTTP status 4xx/5xx) and console errors/uncaught exceptions via Main World monkey-patching.
- **Resilient In-Browser Replay:** Execute saved actions sequentially in the browser with smart element polling, auto-scrolling, native prototype value setters (React/Vue `_valueTracker` support), and reload persistence via `chrome.storage.local`.
- **Live Element Inspector:** Toggleable via `Alt + X` or UI button; renders a non-intrusive high z-index overlay outline and floating card tooltip; copies stable selectors to clipboard with `event.stopPropagation()`.
- **Triple-Format Exporters & Importer:**
  - Format A (Markdown): Human-readable reproduction steps, masked sensitive inputs, highlighted network/console errors.
  - Format B (Playwright `.spec.ts`): Optimized locator priority (`getByTestId` > `getByRole` > `locator('#id')` > `getByText` > `locator(css)`), bug annotations in code comments.
  - Format C (Raw JSON Dump): Complete serializable session format.
  - JSON Session Import: Ability to import and replay JSON dumps on any browser with the extension installed.
- **Privacy & Safety:** Always mask sensitive inputs (password, credit card, auth fields) with `******`. Redact sensitive headers (`Authorization`, `Cookie`) from network events.

#### Non-Goals
- Full video streaming or canvas screen capture (the focus is DOM actions, network, and console telemetry).
- Automatic backend mock API server synthesis.
- Multi-browser cross-engine targets (Safari/Firefox) at this phase; designed strictly for Chrome Manifest V3.

#### Anti-Goals
- Never leak sensitive credentials, tokens, or plaintext passwords in reports or exported data.
- Never permanently modify or contaminate the target web application's DOM or storage.
- Never freeze the user's browser during replay or recording.

---

### 3. Constraints
- **Chrome Manifest V3 Architecture:**
  - Content scripts in the `ISOLATED` world cannot directly patch `window.fetch` or `console.error` in the target page's execution context. Therefore, a `MAIN` world script (`injected.ts`) must be loaded via `chrome.scripting.registerContentScripts` or dynamic script injection to communicate with `content.ts` via `window.postMessage`.
  - Service Workers in MV3 are ephemeral and can terminate during inactivity; state (`RECORDING`, `IDLE`, `REPLAYING`, `INSPECTING`), current session events, and reload queues must be stored in `chrome.storage.local`.
- **Framework Reactivity:** Modern frameworks (React 16+, Vue 3) ignore simple `input.value = 'x'`. Replay must invoke native prototype setters (`HTMLInputElement.prototype.value`), notify `_valueTracker`, and trigger `input` and `change` dispatchers.
- **Page Reload Survival:** Navigation and full-page reloads unmount content scripts. The service worker must track `replayingStepIndex` and pending event queues in storage so the newly instantiated content script on navigation can pick up the next action seamlessly.

---

### 4. Approaches Considered

#### Approach A: Vite + TypeScript + Modular Manifest V3 (Selected)
- **Architecture:** TypeScript codebase bundled with Vite into a zero-dependency `dist/` directory. Exporter logic, selector resolution, masking, and replay runner are structured as unit-testable modules.
- **Trade-offs:** Requires an initial build step on the development machine (`npm run build`), but produces clean, optimized, vanilla assets in `dist/`. End-user machines do NOT need Node.js; they simply load unpacked `dist/` in Chrome.
- **Why Selected:** Guarantees strict type safety adhering to `RecordedSession` and `TrackedEvent` schemas, enforces clean separation of concerns, and simplifies future maintenance.

#### Approach B: Pure Vanilla JavaScript (Rejected)
- **Architecture:** Plain ES files without build tools.
- **Trade-offs:** No build step, but lacks compile-time type safety for complex event schemas, requires manual module management across Main World and Isolated World, and makes automated testing harder.

---

### 5. Detailed System Architecture

```
+---------------------------------------------------------------------------------------+
| Chrome Browser Context                                                                |
|                                                                                       |
|  [MAIN World: injected.ts]                                                            |
|     - Monkey-patch window.fetch / XMLHttpRequest (Status 4xx/5xx logging)             |
|     - Monkey-patch console.error / window.onerror (Console & Exception logging)       |
|     - Sanitize headers (Authorization, Cookie redacted)                               |
|          | (window.postMessage with security token/prefix)                            |
|          v                                                                            |
|  [ISOLATED World: content.ts]                                                         |
|     - Global Event Delegation (Capture Phase: click, input, change, keydown)          |
|     - Live Element Inspector (Alt+X, Hover Tooltip & Outline Overlay, Click-to-Copy)  |
|     - Selector Resolution Engine (TestID > Role/Name > ID > Text > CSS)               |
|     - In-Browser Replay Runner (Polling, ScrollIntoView, React ValueSetter, Events)   |
|          | (chrome.runtime.sendMessage)                                               |
|          v                                                                            |
|  [Background: service-worker.ts]                                                      |
|     - Lifecycle State: IDLE | RECORDING | REPLAYING | INSPECTING                      |
|     - Storage Manager: Session & Reload Queue (chrome.storage.local)                  |
|     - Action Badge updater (REC indicator, step count)                                |
|          |                                                                            |
|          v                                                                            |
|  [UI Layer: popup.html & popup.ts]                                                    |
|     - Controls: Record / Stop, Replay, Inspect Toggle                                 |
|     - Live Session Event Counter and Preview                                          |
|     - Exporters: [Human Markdown] | [Playwright .spec.ts] | [JSON Dump]               |
|     - Importer: [Import JSON Session] for replaying external files                    |
+---------------------------------------------------------------------------------------+
```

---

### 6. Data Specification (Event Schema)

```typescript
export interface RecordedSession {
  sessionId: string;
  metadata: {
    startUrl: string;
    userAgent: string;
    viewport: { width: number; height: number };
    startedAt: number;
    endedAt?: number;
  };
  events: TrackedEvent[];
}

export type TrackedEvent = 
  | ActionEvent 
  | NetworkEvent 
  | ConsoleEvent 
  | NavigationEvent;

export interface ActionEvent {
  id: string;
  category: 'action';
  type: 'click' | 'input' | 'change' | 'keydown';
  timestamp: number;
  url: string;
  selectors: {
    tag: string;
    testId?: string;
    id?: string;
    role?: string;
    name?: string;
    text?: string;
    classes?: string[];
    css: string;
  };
  value?: string;           // Masked if sensitive
  key?: string;             // For keydown (e.g. 'Enter', 'Tab')
  isSensitive?: boolean;
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
  type: 'pushState' | 'replaceState' | 'popstate' | 'reload';
  timestamp: number;
  fromUrl: string;
  toUrl: string;
}
```

---

### 7. Multi-Format Export Engine

#### Format A: Human-Readable Markdown Report
- Translates technical selectors to clear natural labels (e.g., `Button "Sign In"` or `Input "Username"`).
- Always replaces sensitive fields (`isSensitive: true`) with `******`.
- Categorizes failure summaries:
  - Network Failures (HTTP 4xx/5xx) with endpoint, method, duration, and response payload preview.
  - Uncaught Exceptions & Console Errors with messages and stack traces.

#### Format B: Playwright Test Script (`.spec.ts`)
- Generates clean TypeScript Playwright code:
  - Selector priority hierarchy:
    1. `page.getByTestId(...)` if `testId` exists.
    2. `page.getByRole(role, { name: ... })` if `role` and `name` exist.
    3. `page.locator('#id')` if stable `id` exists.
    4. `page.getByText(...)` for buttons/links if unique.
    5. `page.locator(css)` as fallback.
  - Inserts comments annotating detected network/console failures at the exact point in the step sequence.

#### Format C: Raw JSON Session Dump & Importer
- Formats complete `RecordedSession` JSON with 2-space indentation.
- Import capability reads `.json` files, validates structure against `RecordedSession`, saves to `chrome.storage.local`, and immediately enables replay in the browser.

---

### 8. Live Element Inspector Specification
- **Activation:** Shortcut `Alt + X` or UI toggle button.
- **Overlay:** High z-index (`2147483647`), pointer-events none box highlighting element bounds with `2px solid #2563eb` and semi-transparent blue background tint.
- **Tooltip Card:** Positioned adjacent to target element, clamped inside viewport boundaries. Displays:
  - Tag & Role
  - Identifier (`#id` or `data-testid`)
  - Text Preview (truncated $\le 30$ chars)
  - Classes (max 3)
  - Computed Best Selector
- **Click-to-Copy:** Intercepts click in capture phase (`event.preventDefault()`, `event.stopPropagation()`), copies the computed selector to clipboard, and triggers a brief visual toast notification.

---

### 9. Edge Cases, Operational Rules & Safety Constraints
1. **Replay Orchestration & Target Navigation (Builder Call):**
   - The Service Worker acts as the Replay orchestrator. When Replay is initiated (from Popup or JSON import), the Service Worker inspects the active tab. If the tab's current URL does not match `metadata.startUrl`, the Service Worker automatically calls `chrome.tabs.update(tabId, { url: metadata.startUrl })` and listens for `chrome.tabs.onUpdated` (`status === 'complete'`) before messaging `content.ts` to execute the step queue.
2. **Replay Event Execution Scope (Builder Call):**
   - Replay filters `queue: TrackedEvent[]` to execute sequential `ActionEvent`s (clicks, inputs, keydowns). `NetworkEvent`, `ConsoleEvent`, and `NavigationEvent` serve as telemetry metadata for export formats and comments, rather than blocking active assertions.
3. **Recording Tab Scope (Builder Call):**
   - Recording is strictly scoped to the `tabId` where the recording was started. This prevents noise, performance degradation, and accidental leakage from other open browser tabs.
4. **Concurrent Element Inspector during Recording (Builder Call):**
   - Inspector state is decoupled from recording (`isRecording: boolean`, `isInspecting: boolean`). Users can press `Alt + X` while recording to inspect element attributes; inspector click-to-copy calls `event.stopPropagation()` and `event.preventDefault()`, ensuring inspector clicks are NEVER recorded into the action event history.
5. **Sensitive Inputs & Replay Interactive Pause:**
   - Detects input `type="password"`, `autocomplete="cc-number"`, and sensitive keywords (`password`, `pass`, `token`, `secret`, `cvv`, `creditcard`). Masks with `******` in memory, storage, and exports.
   - **Interactive Pause on Replay:** When the In-Browser Replay Engine encounters an action targeting a sensitive field, Replay automatically transitions to a paused state (`REPLAY_PAUSED_WAITING_INPUT`). A non-intrusive floating banner appears over the page prompting: *"Sensitive input detected. Please enter credential and click Resume (or Skip)"*. Once the user enters the value and clicks Resume, Replay proceeds with the remaining steps. This prevents broken auth checkpoints while strictly avoiding plaintext password storage.
6. **Page Reload & Navigation Recovery:**
   - On navigation within the recorded tab, the Service Worker persists `{ isReplaying: true, session: RecordedSession, currentIndex: number }`.
   - On page load, `content.ts` checks storage, waits for DOM readiness (`document.readyState === 'complete'`), and requests the next action.
7. **React / Vue Synthetic Events:**
   - Dispatching standard `.value = ...` does not trigger framework state bindings.
   - Use `Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(element, value)` followed by `element._valueTracker?.setValue(prev)` and dispatching `new Event('input', { bubbles: true })` and `new Event('change', { bubbles: true })`.
8. **Dynamic CSS Classes (Tailwind / CSS-in-JS):**
   - Selector generator ignores dynamic hash patterns (e.g. `css-1x8a2b`, `sc-bwzfXH`, randomly generated hashes) and prioritizes semantic attributes (`data-testid`, accessible role/name, ID, unique hierarchy).
9. **Element Polling & Auto-Scroll:**
   - In replay runner, element lookup polls every 200ms up to 5000ms.
   - Before executing action, invokes `element.scrollIntoView({ behavior: 'smooth', block: 'center' })` to ensure element is interactable.

---

### 10. Left to the Builder
- Precise UI styles and icons for popup and floating toolbar using modern Tailwind-like clean CSS.
- Toast feedback design for inspector click-to-copy.
- Debounce intervals for input tracking (e.g., 300ms debounce to avoid spamming single-character events).
