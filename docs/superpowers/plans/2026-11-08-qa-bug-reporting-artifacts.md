# QA Bug Reporting Artifacts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Equip Web Action Tracker with automated and on-demand visual screenshots, sanitized API request payload capture, system environment metadata, and an enhanced Markdown bug report with 1-click clipboard image copying for QA-to-Developer workflows.

**Architecture:** 
- The Service Worker captures active tab screenshots (compressed JPEG, 65% quality) on network/console errors or manual "Snapshot" triggers, bound by a 15-image ceiling and zero-garbage purge on session reset.
- The Main World script (`injected.js`) intercepts outgoing `fetch` and `XHR` request bodies, sanitizes sensitive keys (`password`, `token`, `secret`, `apiKey`), and attaches truncated payloads to failed `NetworkEvent`s.
- The Exporter formats a developer-ready Markdown report with environment tables, collapsible request/response payloads, and collapsible screenshots, while the Popup UI provides 1-click binary image copying to the system clipboard for instant Jira/GitHub comment pasting.

**Tech Stack:** TypeScript, Chrome Extensions Manifest V3 (`chrome.tabs.captureVisibleTab`, `chrome.storage.local`), Vite, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-08-qa-bug-reporting-artifacts-design.md`

## Global Constraints

- Manifest V3 compliance with zero external runtime dependencies in `dist/`.
- Compressed JPEG format (quality 65%, ~40–60 KB per image) with strict session purge on every `startRecording` or `clearSession`.
- Never capture screenshots if the target tab is inactive (`tab.active !== true`) to protect user privacy.
- Recursive sanitization of sensitive request body keys matching `/(password|token|secret|auth|api_?key|credential)/i`.
- All tests must pass in Vitest (`npm test`).

## Review Focus

1. **Unmasked sensitive keys in nested JSON request payloads:** JSON with deep nesting (e.g. `{ auth: { password: "123" } }`) must have all sensitive leaves replaced with `[REDACTED]`. Pin with test in Task 2.
2. **Background tab error trigger:** When an error occurs while the monitored tab is inactive/backgrounded, `captureVisibleTab` must not be invoked on unrelated tabs. Pin with test in Task 4.
3. **Session start garbage purge:** Starting a new recording must completely wipe previous screenshot artifacts from storage. Pin with test in Task 4.
4. **Binary clipboard image write failure:** When `navigator.clipboard.write` fails or is unsupported, fallback gracefully with a user toast. Pin with test in Task 6.
5. **Markdown export with no screenshots or no network failures:** Exporter must render clean fallback text without broken tables or empty tags. Pin with test in Task 5.

---

### Task 1: Schema & Type Definitions for QA Artifacts

**Files:**
- Modify: `src/types/schema.ts`
- Test: `tests/schema.test.ts`

**Interfaces:**
- Produces: `ScreenshotArtifact`, `EnvironmentMetadata`, updated `NetworkEvent` (with `requestPayload?: string`), updated `RecordedSession` (with `screenshots?: ScreenshotArtifact[]`, `environment?: EnvironmentMetadata`).

- [ ] **Step 1: Write failing schema tests**

```typescript
// in tests/schema.test.ts
it('validates ScreenshotArtifact and EnvironmentMetadata structures', () => {
  const artifact: ScreenshotArtifact = {
    id: 'shot_1',
    timestamp: 1000,
    trigger: 'error_network',
    dataUrl: 'data:image/jpeg;base64,...',
    url: 'https://app.com',
    label: 'API failure'
  };
  expect(artifact.trigger).toBe('error_network');

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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/schema.test.ts`
Expected: FAIL with missing type exports.

- [ ] **Step 3: Implement types in `src/types/schema.ts`**

Export `ScreenshotArtifact`, `EnvironmentMetadata`, update `NetworkEvent` with `requestPayload?: string`, and update `RecordedSession` metadata.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/schema.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/types/schema.ts tests/schema.test.ts
git commit -m "feat(schema): add ScreenshotArtifact and EnvironmentMetadata types"
```

---

### Task 2: Main-World Request Body Interception & Masking

**Files:**
- Modify: `src/main-world/injected.ts`
- Test: `tests/injected.test.ts`

**Interfaces:**
- Produces: `sanitizePayload(payload: any): string`, attaches `requestPayload` to `NetworkEvent` emitted on HTTP >= 400 or network failure.

- [ ] **Step 1: Write failing tests for request body extraction and recursive masking**

```typescript
// in tests/injected.test.ts
it('extracts and masks sensitive keys in fetch POST request body', async () => {
  let capturedEvent: any = null;
  window.addEventListener('message', (e) => {
    if (e.data?.source === '__WAT_TELEMETRY__') capturedEvent = e.data.event;
  });

  const originalFetch = window.fetch;
  window.fetch = vi.fn().mockResolvedValue(new Response('Error', { status: 500 }));

  setupMainWorldInterception();

  await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'tester', password: 'secretpassword', nested: { token: 'xyz123' } })
  });

  expect(capturedEvent).toBeDefined();
  expect(capturedEvent.requestPayload).toContain('"password":"[REDACTED]"');
  expect(capturedEvent.requestPayload).toContain('"token":"[REDACTED]"');
  expect(capturedEvent.requestPayload).toContain('"username":"tester"');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/injected.test.ts`
Expected: FAIL with `requestPayload` undefined.

- [ ] **Step 3: Implement body extraction and `sanitizePayload` in `src/main-world/injected.ts`**

Implement helper `sanitizePayload(body: any): string`:
- If object or JSON string, recursively replace values whose keys match `/(password|token|secret|auth|api_?key|credential)/i` with `"[REDACTED]"`.
- If form-urlencoded/text string, apply regex substitution for key-value pairs.
- Truncate output to 1024 characters.
- In `window.fetch` and `XMLHttpRequest.send`, capture outgoing body and include in emitted `NetworkEvent` on error (`status >= 400 || status === 0`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/injected.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main-world/injected.ts tests/injected.test.ts
git commit -m "feat(telemetry): intercept and sanitize request payloads on network errors"
```

---

### Task 3: Client Environment Context Extraction Utility

**Files:**
- Create: `src/utils/environment.ts`
- Test: `tests/environment.test.ts`

**Interfaces:**
- Produces: `extractEnvironmentMetadata(): EnvironmentMetadata`

- [ ] **Step 1: Write failing test for environment metadata extractor**

```typescript
// in tests/environment.test.ts
import { describe, it, expect } from 'vitest';
import { extractEnvironmentMetadata } from '../src/utils/environment';

describe('Environment Extractor', () => {
  it('extracts OS, browser, viewport, screen resolution, DPR and language', () => {
    const env = extractEnvironmentMetadata();
    expect(env.viewport).toBeDefined();
    expect(env.viewport.width).toBeGreaterThan(0);
    expect(env.screenResolution).toBeDefined();
    expect(typeof env.devicePixelRatio).toBe('number');
    expect(typeof env.online).toBe('boolean');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/environment.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement `extractEnvironmentMetadata` in `src/utils/environment.ts`**

Extract:
- `viewport`: `{ width: window.innerWidth, height: window.innerHeight }`
- `screenResolution`: `{ width: window.screen.width, height: window.screen.height }`
- `devicePixelRatio`: `window.devicePixelRatio || 1`
- `language`: `navigator.language || 'en-US'`
- `online`: `navigator.onLine ?? true`
- `os`: Parsed from `navigator.userAgent` (Windows, macOS, Linux, Android, iOS)
- `browser`: Parsed from `navigator.userAgent` (e.g. Chrome/130)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/environment.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/environment.ts tests/environment.test.ts
git commit -m "feat(utils): add client environment metadata extractor"
```

---

### Task 4: Service Worker Screenshot Engine & Lifecycle Purge

**Files:**
- Modify: `src/background/service-worker.ts`
- Test: `tests/service-worker.test.ts`

**Interfaces:**
- Produces: `captureScreenshot(trigger: ScreenshotArtifact['trigger'], tabId?: number, label?: string): Promise<ScreenshotArtifact | null>`
- Produces: `clearSession(): Promise<void>`
- Consumes: `extractEnvironmentMetadata()` when starting recording.

- [ ] **Step 1: Write failing tests for screenshot capture, tab active safety, and session purge**

```typescript
// in tests/service-worker.test.ts
it('captures compressed JPEG screenshot only when tab is active and respects ceiling', async () => {
  const tabsMock = {
    get: vi.fn().mockResolvedValue({ id: 101, windowId: 1, active: true }),
    captureVisibleTab: vi.fn().mockImplementation((winId, opts, cb) => cb('data:image/jpeg;base64,mock')),
    sendMessage: vi.fn().mockResolvedValue({ success: true })
  };
  const sw = new ServiceWorkerStateManager(mockStorage, mockAction, tabsMock as any);
  await sw.startRecording(101, 'https://app.com');

  const shot1 = await sw.captureScreenshot('manual', 101, 'Step 1');
  expect(shot1).toBeDefined();
  expect(shot1?.trigger).toBe('manual');
  expect((await sw.getState()).currentSession?.screenshots?.length).toBe(1);

  // Tab inactive -> skips capture for privacy
  tabsMock.get.mockResolvedValueOnce({ id: 101, windowId: 1, active: false });
  const shot2 = await sw.captureScreenshot('error_console', 101);
  expect(shot2).toBeNull();
  expect((await sw.getState()).currentSession?.screenshots?.length).toBe(1);
});

it('purges previous screenshots completely when new recording begins', async () => {
  const tabsMock = {
    get: vi.fn().mockResolvedValue({ id: 101, windowId: 1, active: true }),
    captureVisibleTab: vi.fn().mockImplementation((winId, opts, cb) => cb('data:image/jpeg;base64,mock')),
    sendMessage: vi.fn().mockResolvedValue({ success: true })
  };
  const sw = new ServiceWorkerStateManager(mockStorage, mockAction, tabsMock as any);
  await sw.startRecording(101, 'https://app.com');
  await sw.captureScreenshot('manual', 101);
  expect((await sw.getState()).currentSession?.screenshots?.length).toBe(1);

  // Start new recording
  await sw.startRecording(101, 'https://app.com/new');
  expect((await sw.getState()).currentSession?.screenshots?.length).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/service-worker.test.ts`
Expected: FAIL with `captureScreenshot` not a function.

- [ ] **Step 3: Implement `captureScreenshot` and auto-trigger on error in `src/background/service-worker.ts`**

- In `captureScreenshot`: query tab, verify `tab.active === true`, call `chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 65 })`. Append to `screenshots` array (limit 15 ceiling).
- In `recordEvent`: if `isNetworkEvent(event) && event.status >= 400` or `isConsoleEvent(event)`, trigger `this.captureScreenshot(...)` with 1000ms debounce.
- In `startRecording`: initialize `currentSession.screenshots = []` and populate `metadata.environment`.
- In `clearSession`: purge `currentSession.events` and `currentSession.screenshots` and persist.
- Register `CAPTURE_SCREENSHOT` and `CLEAR_SESSION` message handlers.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/service-worker.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/background/service-worker.ts tests/service-worker.test.ts
git commit -m "feat(background): implement screenshot capture with active tab safety and session purge"
```

---

### Task 5: Markdown Bug Reproduction Exporter Updates

**Files:**
- Modify: `src/exporters/markdown.ts`
- Test: `tests/markdown-exporter.test.ts`

**Interfaces:**
- Produces: Updated `exportToMarkdown(session: RecordedSession): string` including Environment table, Request Payload in Network Failures, and Visual Evidence section.

- [ ] **Step 1: Write failing test for enhanced Markdown report sections**

```typescript
// in tests/markdown-exporter.test.ts
it('formats environment metadata, request payloads, and collapsible screenshots in report', () => {
  const session: RecordedSession = {
    sessionId: 'rec_qa',
    metadata: {
      startUrl: 'https://app.com',
      userAgent: 'Chrome',
      viewport: { width: 1920, height: 1080 },
      startedAt: 1000,
      environment: {
        os: 'Windows 11',
        browser: 'Chrome 130',
        screenResolution: { width: 2560, height: 1440 },
        viewport: { width: 1920, height: 1080 },
        devicePixelRatio: 1.25,
        language: 'en-US',
        online: true
      }
    },
    events: [
      {
        id: 'n1', category: 'network', type: 'fetch', timestamp: 1050, url: 'https://app.com',
        method: 'POST', requestUrl: 'https://api.app.com/checkout', status: 500, durationMs: 120,
        requestPayload: '{"cartId":"123","items":[1,2]}', responsePreview: 'Internal Server Error'
      }
    ],
    screenshots: [
      { id: 's1', timestamp: 1060, trigger: 'error_network', dataUrl: 'data:image/jpeg;base64,abc123mock', url: 'https://app.com' }
    ]
  };

  const md = exportToMarkdown(session);
  expect(md).toContain('## 💻 System & Environment');
  expect(md).toContain('| OS | Windows 11 |');
  expect(md).toContain('<summary>Request Payload</summary>');
  expect(md).toContain('{"cartId":"123","items":[1,2]}');
  expect(md).toContain('## 📸 Visual Evidence');
  expect(md).toContain('<details><summary>📸 View Image');
  expect(md).toContain('data:image/jpeg;base64,abc123mock');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/markdown-exporter.test.ts`
Expected: FAIL with missing environment and visual evidence sections.

- [ ] **Step 3: Update `src/exporters/markdown.ts`**

- Add System & Environment table formatting from `session.metadata.environment`.
- Under Failed Network Calls, render collapsible `<details><summary>Request Payload</summary><pre><code>...</code></pre></details>` when `e.requestPayload` exists.
- Under Visual Evidence, render metadata and `<details><summary>📸 View Image (Base64)</summary><img src="..." alt="Screenshot" width="600" /></details>`.
- Add clean fallback when screenshots or environment are absent.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/markdown-exporter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/exporters/markdown.ts tests/markdown-exporter.test.ts
git commit -m "feat(exporter): add environment table, request payload details, and visual evidence to markdown report"
```

---

### Task 6: Popup UI Updates (Snapshot Button, Clear Button, Gallery Strip & 1-Click Copy Image)

**Files:**
- Modify: `popup.html`
- Modify: `src/ui/popup/popup.css`
- Modify: `src/ui/popup/popup.ts`
- Test: `tests/popup.test.ts`

**Interfaces:**
- Produces: Snapshot and Clear button handlers, gallery thumbnail rendering, 1-click clipboard binary image copying via `navigator.clipboard.write([new ClipboardItem(...)])`.

- [ ] **Step 1: Write failing popup tests for snapshot, clear, and screenshot gallery**

```typescript
// in tests/popup.test.ts
it('binds snapshot button and triggers CAPTURE_SCREENSHOT message', async () => {
  const mockSend = vi.fn().mockResolvedValue({ success: true });
  const mockGetActiveTab = vi.fn().mockResolvedValue({ id: 101, url: 'https://app.com' });

  setupPopupHandlers({ sendMessage: mockSend, getActiveTab: mockGetActiveTab });
  const btnSnapshot = document.getElementById('btn-snapshot') as HTMLButtonElement;
  btnSnapshot.click();

  await new Promise(r => setTimeout(r, 10));
  expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ type: 'CAPTURE_SCREENSHOT', tabId: 101 }));
});

it('binds clear button and triggers CLEAR_SESSION when IDLE', async () => {
  const mockSend = vi.fn().mockResolvedValue({ success: true });
  const mockGetActiveTab = vi.fn().mockResolvedValue({ id: 101, url: 'https://app.com' });

  setupPopupHandlers({ sendMessage: mockSend, getActiveTab: mockGetActiveTab });
  const btnClear = document.getElementById('btn-clear') as HTMLButtonElement;
  btnClear.click();

  await new Promise(r => setTimeout(r, 10));
  expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ type: 'CLEAR_SESSION' }));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/popup.test.ts`
Expected: FAIL with `btn-snapshot` not found.

- [ ] **Step 3: Update `popup.html`, `popup.css`, and `popup.ts`**

- In `popup.html`: Add `#btn-snapshot` ("📸 Snapshot") and `#btn-clear` ("🗑️ Clear"), plus container `#screenshot-gallery`.
- In `popup.css`: Style thumbnail strip, snapshot button, and copy image pill.
- In `popup.ts`:
  - Pass environment data when calling `START_RECORDING`.
  - Bind `btn-snapshot` to send `CAPTURE_SCREENSHOT`.
  - Bind `btn-clear` to send `CLEAR_SESSION` and clear UI timeline/counters.
  - Implement `copyScreenshotImage(dataUrl: string)` converting base64 dataUrl to PNG blob and writing to clipboard via `new ClipboardItem({ 'image/png': blob })`.
  - Update `renderStatus` to disable `#btn-snapshot` when IDLE, and disable `#btn-clear` when RECORDING.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/popup.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add popup.html src/ui/popup/popup.css src/ui/popup/popup.ts tests/popup.test.ts
git commit -m "feat(popup): add snapshot button, clear button, and 1-click clipboard image copying"
```

---

### Task 7: Build Packaging & End-to-End Verification

**Files:**
- Test: All test suites (`tests/**/*.test.ts`)
- Output: `dist/`

- [ ] **Step 1: Run full test suite across all 16 test files**

Run: `npx vitest run`
Expected: All tests PASS (55+ tests green).

- [ ] **Step 2: Compile production bundles with Vite**

Run: `npm run build`
Expected: Build passes cleanly with standalone IIFE bundles for `content.js`, `injected.js`, `service-worker.js`, and `popup.js`.

- [ ] **Step 3: Commit and Push**

```bash
git add .
git commit -m "chore(release): package QA bug reporting artifacts with screenshots and payload inspection"
git push origin main
```
