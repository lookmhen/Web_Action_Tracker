# Web Action Tracker, Bug Replay & Element Inspector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-grade Chrome Extension (Manifest V3) in TypeScript for automated web action & error recording, live element inspection, in-browser replay across page reloads and modern frameworks, and triple-format export (Markdown, Playwright `.spec.ts`, JSON dump/import).

**Architecture:** MV3 architecture cleanly separated into MAIN world telemetry (`injected.ts`), ISOLATED world event capture & inspector & replay runner (`content.ts`), Background lifecycle and reload storage orchestrator (`service-worker.ts`), and a modern popup UI with exporters and importer (`popup.ts`). TypeScript codebase bundled with Vite into a zero-dependency `dist/` directory.

**Tech Stack:** TypeScript, Vite, Vitest, Chrome Extension Manifest V3 (`chrome.storage`, `chrome.scripting`, `chrome.tabs`, `chrome.webNavigation`).

**Spec:** `docs/superpowers/specs/2026-11-07-web-action-tracker-design.md`

## Global Constraints
- Chrome Extension Manifest V3 compliance.
- Zero-dependency runtime in `dist/` (end users load unpacked folder in Chrome without Node.js).
- Sensitive fields (`type="password"`, `autocomplete="cc-number"`, sensitive keywords) must always be masked as `******` across all storage and exports.
- Network sensitive headers (`Authorization`, `Cookie`) must be stripped from network logs.
- React/Vue synthetic event support using `HTMLInputElement.prototype.value` setter and `_valueTracker`.
- Replay reload persistence managed via `chrome.storage.local`.

## Review Focus
1. **Empty session handling:** Exporting a session with 0 events must output a valid minimal Markdown report, valid Playwright test template, and valid JSON without crashing. (Tested in Task 4)
2. **Sensitive input detection beyond type="password":** Inputs with `name="card_number"`, `autocomplete="cc-number"`, or `id="apiKey"` must be identified as sensitive and masked with `******`. (Tested in Task 3)
3. **Network request failure with status 0 (Abort / Network Error):** Fetch/XHR error handlers must log the failure safely without throwing uncaught exceptions into the target webpage. (Tested in Task 5)
4. **Replay timeout on missing/detached DOM element:** Polling mechanism must cleanly timeout after 5000ms with a descriptive message rather than hanging indefinitely. (Tested in Task 7)
5. **Payload truncation for large network responses:** Responses larger than 2KB must be truncated with `... [truncated]` in `responsePreview` to prevent `chrome.storage.local` quota limits. (Tested in Task 5)

---

### Task 1: Project Scaffolding, Build Configuration & Manifest V3 Setup

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `public/manifest.json`
- Create: `public/icons/icon16.png`, `public/icons/icon48.png`, `public/icons/icon128.png`
- Test: `tests/setup.test.ts`

**Interfaces:**
- Produces: Build pipeline `npm run build` generating `dist/` containing `manifest.json`, `service-worker.js`, `content.js`, `injected.js`, `popup.html`, and assets; test command `npm test` via Vitest.

- [ ] **Step 1: Write setup test checking project config and manifest structure**
```typescript
// tests/setup.test.ts
import { describe, it, expect } from 'vitest';
import manifest from '../public/manifest.json';

describe('Project Manifest V3 Configuration', () => {
  it('should be valid Manifest V3 with required permissions and entries', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.name).toBe('Web Action Tracker & Bug Replay');
    expect(manifest.permissions).toContain('storage');
    expect(manifest.permissions).toContain('activeTab');
    expect(manifest.permissions).toContain('scripting');
    expect(manifest.background.service_worker).toBe('service-worker.js');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run tests/setup.test.ts`
Expected: FAIL (files do not exist yet)

- [ ] **Step 3: Implement `package.json`, `tsconfig.json`, `vite.config.ts`, `public/manifest.json`, and icons**
Configure Vite with Rollup inputs for `service-worker`, `content`, `injected`, and `popup.html`. Generate placeholder icons and install dependencies (`vite`, `typescript`, `vitest`, `@types/chrome`).

- [ ] **Step 4: Run test and build to verify setup**
Run: `npm test && npm run build`
Expected: PASS and `dist/` directory generated with valid Manifest V3 bundle.

- [ ] **Step 5: Commit**
```bash
git add package.json tsconfig.json vite.config.ts public/ tests/setup.test.ts
git commit -m "chore: setup project build tooling, manifest v3 and vitest"
```

---

### Task 2: Data Schema Definitions & Type Guards

**Files:**
- Create: `src/types/schema.ts`
- Test: `tests/schema.test.ts`

**Interfaces:**
- Produces: `RecordedSession`, `TrackedEvent`, `ActionEvent`, `NetworkEvent`, `ConsoleEvent`, `NavigationEvent`, `ExtensionState`, and type guards `isActionEvent`, `isNetworkEvent`, `isConsoleEvent`, `isNavigationEvent`.

- [ ] **Step 1: Write test for schema type guards and session creation**
```typescript
// tests/schema.test.ts
import { describe, it, expect } from 'vitest';
import { isActionEvent, isNetworkEvent, isConsoleEvent, isNavigationEvent, createNewSession } from '../src/types/schema';

describe('Data Schema & Type Guards', () => {
  it('correctly categorizes events with type guards', () => {
    const action = { id: '1', category: 'action', type: 'click', timestamp: 100, url: 'http://a.com', selectors: { tag: 'button', css: 'button' } };
    expect(isActionEvent(action as any)).toBe(true);
    expect(isNetworkEvent(action as any)).toBe(false);
  });

  it('creates an initialized session with metadata', () => {
    const session = createNewSession('https://app.example.com', 'Mozilla/5.0', { width: 1920, height: 1080 });
    expect(session.sessionId).toMatch(/^rec_\d+_/);
    expect(session.events).toEqual([]);
    expect(session.metadata.startUrl).toBe('https://app.example.com');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run tests/schema.test.ts`
Expected: FAIL with module not found

- [ ] **Step 3: Implement `src/types/schema.ts`**
Export interfaces matching Section 6 of the spec, along with `createNewSession`, `isActionEvent`, `isNetworkEvent`, `isConsoleEvent`, and `isNavigationEvent`.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/schema.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/types/schema.ts tests/schema.test.ts
git commit -m "feat(types): implement data schema and event type guards"
```

---

### Task 3: Sensitive Field Masking & Selector Resolution Engine

**Files:**
- Create: `src/utils/masking.ts`
- Create: `src/utils/selectors.ts`
- Test: `tests/masking.test.ts`
- Test: `tests/selectors.test.ts`

**Interfaces:**
- Produces:
  - `isSensitiveInput(element: HTMLInputElement | HTMLTextAreaElement): boolean`
  - `maskValue(value: string): string` (returns `'******'`)
  - `resolveElementSelectors(element: HTMLElement): ElementSelectors` with priority `testId` > `role + name` > `id` > `text` > `css`, ignoring dynamic Tailwind hash classes.

- [ ] **Step 1: Write failing tests for masking and selector resolution**
```typescript
// tests/masking.test.ts
import { describe, it, expect } from 'vitest';
import { isSensitiveInput, maskValue } from '../src/utils/masking';

describe('Masking Engine', () => {
  it('identifies password type as sensitive', () => {
    const input = document.createElement('input');
    input.type = 'password';
    expect(isSensitiveInput(input)).toBe(true);
    expect(maskValue('secret123')).toBe('******');
  });

  it('identifies sensitive keywords in name, autocomplete, id (Review Focus #2)', () => {
    const input = document.createElement('input');
    input.name = 'creditCardNumber';
    input.setAttribute('autocomplete', 'cc-number');
    expect(isSensitiveInput(input)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**
Run: `npx vitest run tests/masking.test.ts tests/selectors.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `src/utils/masking.ts` and `src/utils/selectors.ts`**
Implement sensitive input heuristic detection and robust selector resolution extracting `testId` (`data-testid`, `data-test`, `data-qa`), ARIA `role` and accessible `name`, `#id`, clean text preview ($\le 30$ chars), filtered CSS classes (skipping dynamic hashes like `css-1x8a2b`, `sc-bwzfXH`), and computed minimal unique CSS selector.

- [ ] **Step 4: Run tests to verify they pass**
Run: `npx vitest run tests/masking.test.ts tests/selectors.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/utils/masking.ts src/utils/selectors.ts tests/masking.test.ts tests/selectors.test.ts
git commit -m "feat(utils): implement sensitive input masking and selector resolution engine"
```

---

### Task 4: Multi-Format Export Engine (Markdown, Playwright, JSON) & Importer

**Files:**
- Create: `src/exporters/markdown.ts`
- Create: `src/exporters/playwright.ts`
- Create: `src/exporters/json.ts`
- Test: `tests/markdown-exporter.test.ts`
- Test: `tests/playwright-exporter.test.ts`
- Test: `tests/json-exporter.test.ts`

**Interfaces:**
- Consumes: `RecordedSession`, `TrackedEvent` from `src/types/schema.ts`
- Produces:
  - `exportToMarkdown(session: RecordedSession): string`
  - `exportToPlaywright(session: RecordedSession): string`
  - `exportToJson(session: RecordedSession): string`
  - `importFromJson(jsonString: string): RecordedSession`

- [ ] **Step 1: Write failing tests for Markdown, Playwright, and JSON exporters/importer**
```typescript
// tests/markdown-exporter.test.ts
import { describe, it, expect } from 'vitest';
import { exportToMarkdown } from '../src/exporters/markdown';
import { RecordedSession } from '../src/types/schema';

describe('Markdown Exporter', () => {
  it('generates human-readable report with steps and failure sections', () => {
    const session: RecordedSession = {
      sessionId: 'rec_001',
      metadata: { startUrl: 'https://app.example.com/login', userAgent: 'Chrome/131', viewport: { width: 1920, height: 1080 }, startedAt: 1794141480000 },
      events: [
        { id: '1', category: 'action', type: 'input', timestamp: 1794141481000, url: 'https://app.example.com/login', selectors: { tag: 'input', id: 'user-input', css: '#user-input' }, value: 'qa_tester' },
        { id: '2', category: 'action', type: 'click', timestamp: 1794141482000, url: 'https://app.example.com/login', selectors: { tag: 'button', testId: 'login-submit', text: 'Sign In', css: 'button.btn-primary' } },
        { id: '3', category: 'network', type: 'fetch', timestamp: 1794141483000, url: 'https://app.example.com/login', method: 'POST', requestUrl: 'https://api.example.com/v1/auth', status: 500, durationMs: 320, responsePreview: '{"status":"error"}' }
      ]
    };
    const md = exportToMarkdown(session);
    expect(md).toContain('## 🐛 Bug Reproduction Report');
    expect(md).toContain('Button **"Sign In"**');
    expect(md).toContain('Network Failure (HTTP 500)');
  });

  it('handles empty session gracefully (Review Focus #1)', () => {
    const emptySession: RecordedSession = {
      sessionId: 'rec_empty',
      metadata: { startUrl: 'https://example.com', userAgent: 'Chrome', viewport: { width: 1000, height: 800 }, startedAt: Date.now() },
      events: []
    };
    const md = exportToMarkdown(emptySession);
    expect(md).toContain('No events recorded');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**
Run: `npx vitest run tests/markdown-exporter.test.ts tests/playwright-exporter.test.ts tests/json-exporter.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `src/exporters/markdown.ts`, `src/exporters/playwright.ts`, and `src/exporters/json.ts`**
Implement the three exact formats from Section 4 of the spec:
- Markdown with natural language translation, masked inputs, and highlighted failure blocks.
- Playwright script with locator priority `getByTestId` > `getByRole` > `locator('#id')` > `getByText` > `locator(css)` and inline failure comments.
- JSON dump serialization and strict parser with schema validation for JSON import.

- [ ] **Step 4: Run tests to verify they pass**
Run: `npx vitest run tests/markdown-exporter.test.ts tests/playwright-exporter.test.ts tests/json-exporter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/exporters/ tests/*-exporter.test.ts
git commit -m "feat(exporters): implement markdown, playwright, and json export and import engine"
```

---

### Task 5: Main-World Telemetry Interception (`injected.ts`)

**Files:**
- Create: `src/main-world/injected.ts`
- Test: `tests/injected.test.ts`

**Interfaces:**
- Produces: Self-executing script running in MAIN world that monkey-patches `window.fetch`, `XMLHttpRequest.prototype.open`/`send`, `console.error`, and `window.onerror`, posting telemetry to `window.postMessage({ source: '__WAT_TELEMETRY__', payload: ... })`.
- Sanitizes headers (`Authorization`, `Cookie`) and truncates payloads > 2KB.

- [ ] **Step 1: Write test for monkey-patching fetch, XHR, and console.error**
```typescript
// tests/injected.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupMainWorldInterception } from '../src/main-world/injected';

describe('Main World Interception', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('intercepts fetch 500 error and emits telemetry message', async () => {
    const postMessageSpy = vi.spyOn(window, 'postMessage');
    setupMainWorldInterception();

    // Mock fetch returning 500
    window.fetch = vi.fn().mockResolvedValue(new Response('{"error":"fail"}', { status: 500 }));
    await window.fetch('https://api.example.com/data');

    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        source: '__WAT_TELEMETRY__',
        event: expect.objectContaining({ category: 'network', status: 500 })
      }),
      '*'
    );
  });

  it('handles fetch abort or network failure with status 0 safely (Review Focus #3)', async () => {
    setupMainWorldInterception();
    window.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(window.fetch('https://api.example.com/fail')).rejects.toThrow('Failed to fetch');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run tests/injected.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `src/main-world/injected.ts`**
Implement non-invasive monkey-patching preserving original behaviors, redacting sensitive request headers, truncating response body previews to $\le 2048$ chars, and dispatching structured `postMessage` payloads.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/injected.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/main-world/injected.ts tests/injected.test.ts
git commit -m "feat(telemetry): implement main-world fetch, xhr, and console interception"
```

---

### Task 6: Live Element Inspector with Alt+X and Overlay Tooltip

**Files:**
- Create: `src/content-script/inspector.ts`
- Test: `tests/inspector.test.ts`

**Interfaces:**
- Produces:
  - `initInspector(): { toggle: () => boolean, enable: () => void, disable: () => void, isEnabled: () => boolean }`
  - High z-index highlight box (`border: 2px solid #2563eb`) and floating tooltip card displaying Tag & Role, ID/TestID, Text Preview, Classes, and Computed Selector.
  - Intercepts clicks on inspect target, copies selector to clipboard, prevents event bubbling to page, and shows a copy confirmation toast.

- [ ] **Step 1: Write test for Inspector activation, hover overlay positioning, and click-to-copy**
```typescript
// tests/inspector.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createInspector } from '../src/content-script/inspector';

describe('Live Element Inspector', () => {
  beforeEach(() => {
    document.body.innerHTML = '<button id="btn-save" class="btn primary">Save Changes</button>';
  });

  it('toggles inspector mode and creates overlay elements', () => {
    const inspector = createInspector();
    expect(inspector.isEnabled()).toBe(false);
    inspector.toggle();
    expect(inspector.isEnabled()).toBe(true);
    expect(document.getElementById('__wat_inspector_overlay__')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run tests/inspector.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `src/content-script/inspector.ts`**
Implement the overlay DOM container, mouseover listener with viewport-clamped positioning for the tooltip card, `Alt+X` keyboard shortcut binding, click capture with `stopPropagation()`, and clipboard copy feedback toast.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/inspector.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/content-script/inspector.ts tests/inspector.test.ts
git commit -m "feat(inspector): implement live element inspector overlay and click-to-copy"
```

---

### Task 7: In-Browser Replay Engine with Framework Setter & Interactive Pause

**Files:**
- Create: `src/content-script/replay.ts`
- Test: `tests/replay.test.ts`

**Interfaces:**
- Produces:
  - `executeReplayStep(action: ActionEvent): Promise<{ success: boolean; error?: string }>`
  - `startReplayRunner(session: RecordedSession, onStepProgress: (index: number) => void): Promise<void>`
  - Includes element polling (up to 5000ms), `scrollIntoView`, React/Vue native prototype setter + `_valueTracker`, and interactive pause banner when `action.isSensitive === true`.

- [ ] **Step 1: Write test for element polling, React value setter, and sensitive field interactive pause**
```typescript
// tests/replay.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeReplayStep } from '../src/content-script/replay';
import { ActionEvent } from '../src/types/schema';

describe('In-Browser Replay Engine', () => {
  beforeEach(() => {
    document.body.innerHTML = '<input id="user-name" type="text" />';
  });

  it('updates input value and dispatches input/change synthetic events for React/Vue', async () => {
    const input = document.getElementById('user-name') as HTMLInputElement;
    let inputFired = false;
    input.addEventListener('input', () => { inputFired = true; });

    const step: ActionEvent = {
      id: 'step_1', category: 'action', type: 'input', timestamp: 100, url: 'http://localhost',
      selectors: { tag: 'input', id: 'user-name', css: '#user-name' },
      value: 'qa_user'
    };

    const result = await executeReplayStep(step);
    expect(result.success).toBe(true);
    expect(input.value).toBe('qa_user');
    expect(inputFired).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run tests/replay.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `src/content-script/replay.ts`**
Implement sequential action execution:
- Element resolution with polling up to 5000ms.
- Auto-scroll `scrollIntoView({ behavior: 'smooth', block: 'center' })`.
- Native prototype setter `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, val)` and `_valueTracker` update.
- Dispatch `input`, `change`, `click`, and `keydown` events with `bubbles: true, composed: true`.
- Sensitive input prompt: renders floating interactive banner asking user to enter password and click Resume or Skip.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/replay.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/content-script/replay.ts tests/replay.test.ts
git commit -m "feat(replay): implement replay engine with react value setter and sensitive pause"
```

---

### Task 8: Content Script Coordinator & Event Delegation (`content.ts`)

**Files:**
- Create: `src/content-script/content.ts`
- Test: `tests/content.test.ts`

**Interfaces:**
- Produces: Integrated content script coordinating global event delegation in capture phase (`click`, `input`, `change`, `keydown`), receiving telemetry from `injected.ts`, interacting with inspector and replay modules, and bridging to background service worker via `chrome.runtime.sendMessage`.

- [ ] **Step 1: Write test for capture phase event listener and message dispatching**
```typescript
// tests/content.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleDomEvent } from '../src/content-script/content';

describe('Content Script Event Delegation', () => {
  beforeEach(() => {
    document.body.innerHTML = '<button id="btn-submit">Submit</button>';
  });

  it('extracts action event on click in capture phase', () => {
    const btn = document.getElementById('btn-submit')!;
    const mockSend = vi.fn();
    const event = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(event, 'target', { value: btn });

    const tracked = handleDomEvent(event, mockSend);
    expect(tracked).toBeTruthy();
    expect(tracked?.category).toBe('action');
    expect(tracked?.type).toBe('click');
    expect(tracked?.selectors.id).toBe('btn-submit');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run tests/content.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `src/content-script/content.ts`**
Attach capture phase event listeners, debounce input events (300ms), listen for `window.postMessage` from `injected.ts`, forward events to service worker, and check on initialization if the tab is in an active replay sequence to resume execution after page reload.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/content.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/content-script/content.ts tests/content.test.ts
git commit -m "feat(content): implement capture phase event delegation and service worker bridge"
```

---

### Task 9: Background Service Worker Lifecycle & Page Reload Persistence

**Files:**
- Create: `src/background/service-worker.ts`
- Test: `tests/service-worker.test.ts`

**Interfaces:**
- Produces: MV3 Service Worker managing extension state (`IDLE`, `RECORDING`, `REPLAYING`, `INSPECTING`), persisting sessions in `chrome.storage.local`, updating browser action badges (`REC`, step count), scoping recordings to target `tabId`, managing replay page navigation, and resuming replay upon page reloads.

- [ ] **Step 1: Write test for service worker state transitions and storage sync**
```typescript
// tests/service-worker.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ServiceWorkerStateManager } from '../src/background/service-worker';

describe('Service Worker State Manager', () => {
  let manager: ServiceWorkerStateManager;
  let mockStorage: Record<string, any>;

  beforeEach(() => {
    mockStorage = {};
    manager = new ServiceWorkerStateManager({
      get: vi.fn((keys, cb) => cb(mockStorage)),
      set: vi.fn((items, cb) => { Object.assign(mockStorage, items); cb && cb(); })
    } as any);
  });

  it('starts recording and updates state and badge', async () => {
    await manager.startRecording(101, 'https://app.example.com');
    expect(manager.getState().status).toBe('RECORDING');
    expect(manager.getState().activeTabId).toBe(101);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run tests/service-worker.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `src/background/service-worker.ts`**
Implement the state manager, badge updater, storage synchronization, navigation watcher (`chrome.tabs.onUpdated` / `chrome.webNavigation.onCompleted`), message handlers for content script and popup, and dynamic injection of `injected.js` into the MAIN world via `chrome.scripting.executeScript` or `registerContentScripts`.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/service-worker.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/background/service-worker.ts tests/service-worker.test.ts
git commit -m "feat(background): implement service worker state machine and reload persistence"
```

---

### Task 10: Extension Popup UI, Live Timeline & Exporters/Importer Controls

**Files:**
- Create: `src/ui/popup/popup.html`
- Create: `src/ui/popup/popup.css`
- Create: `src/ui/popup/popup.ts`
- Test: `tests/popup.test.ts`

**Interfaces:**
- Produces: Popup interface featuring:
  - Header with extension logo, version, and status badge (Recording / Idle / Replaying).
  - Main Controls: Start/Stop Record button, Toggle Inspector button (with `Alt+X` shortcut tag), Replay button.
  - Live Event Feed / Timeline showing recent steps with icons and timestamps.
  - Export Tab: Format A (Markdown), Format B (Playwright `.spec.ts`), Format C (JSON) with "Copy to Clipboard" and "Download File" buttons.
  - Import Tab: File upload input to import external `.json` session and load it directly into replay.

- [ ] **Step 1: Write test for popup UI interaction logic and exporter triggering**
```typescript
// tests/popup.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupPopupHandlers } from '../src/ui/popup/popup';

describe('Popup UI Handlers', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="status-badge">IDLE</div>
      <button id="btn-record">Record</button>
      <button id="btn-inspect">Inspect</button>
      <button id="btn-replay">Replay</button>
      <button id="btn-export-md">Copy MD</button>
      <div id="event-list"></div>
    `;
  });

  it('binds record toggle and updates UI status', () => {
    const mockSend = vi.fn().mockResolvedValue({ status: 'RECORDING' });
    setupPopupHandlers(mockSend);
    const btn = document.getElementById('btn-record')!;
    btn.click();
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ type: 'TOGGLE_RECORDING' }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run tests/popup.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `src/ui/popup/popup.html`, `popup.css`, and `popup.ts`**
Create clean, accessible popup UI using modern CSS styling (Tailwind-style color palette: slate/blue/emerald/rose), wire all buttons to service worker messages and exporter functions, and handle JSON file reading via `FileReader`.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/popup.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/ui/popup/ tests/popup.test.ts
git commit -m "feat(ui): implement popup interface, live event timeline, and exporter controls"
```

---

### Task 11: End-to-End Build Integration & Manifest V3 Packaging Verification

**Files:**
- Modify: `vite.config.ts` (if needed for output formatting)
- Create: `tests/e2e-package.test.ts`

**Interfaces:**
- Produces: Complete, verified `dist/` directory ready to be loaded unpacked into Chrome.

- [ ] **Step 1: Write E2E package verification test**
```typescript
// tests/e2e-package.test.ts
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Built Extension Package Verification', () => {
  it('verifies dist contains all required Manifest V3 assets', () => {
    const dist = path.resolve(__dirname, '../dist');
    expect(fs.existsSync(dist)).toBe(true);
    expect(fs.existsSync(path.join(dist, 'manifest.json'))).toBe(true);
    expect(fs.existsSync(path.join(dist, 'service-worker.js'))).toBe(true);
    expect(fs.existsSync(path.join(dist, 'content.js'))).toBe(true);
    expect(fs.existsSync(path.join(dist, 'injected.js'))).toBe(true);
    expect(fs.existsSync(path.join(dist, 'popup.html'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails (before final build check)**
Run: `npx vitest run tests/e2e-package.test.ts`
Expected: Verifies current build output

- [ ] **Step 3: Run complete build and verify assets**
Run: `npm run build`
Ensure all entry points bundle cleanly into `dist/` without unresolved imports.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/e2e-package.test.ts`
Expected: PASS

- [ ] **Step 5: Final packaging commit**
```bash
git add vite.config.ts tests/e2e-package.test.ts
git commit -m "test: add end-to-end package verification and ensure clean distribution build"
```
