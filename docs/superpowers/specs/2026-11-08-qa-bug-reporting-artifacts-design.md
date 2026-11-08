# Technical Design Spec: QA Bug Reporting Artifacts (Screenshots, Network Payloads & Environment Context)

## 1. Intent & Purpose
Optimize Web Action Tracker specifically for QA Engineers and Testers reporting bugs to Software Developers. Provide instant, actionable bug context in a single 1-click Markdown export by bundling:
1. Automated error screenshots and manual snapshots.
2. Sanitized outgoing API request payloads and failed responses.
3. System and client environment metadata.
All visual assets follow a strict **Zero-Clutter Architecture** (FIFO cap of 3 images, JPEG 65% compression, ~150 KB total budget, and automatic session cleanup) to prevent storage bloat or browser slowness.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- **Automated Failure Screenshots:** Automatically capture a compressed JPEG snapshot of the active tab when a network failure (HTTP 4xx/5xx/0) or console error occurs.
- **Manual QA Snapshot:** Provide a "📸 Snapshot" button in the popup to capture the current state on demand.
- **Generous Visual Evidence with Guaranteed Cleanup:** Store compressed JPEG snapshots (65% quality, ~40–60 KB each) captured automatically on failures and manually on demand (capped at a safe upper ceiling of 15 images per session to prevent runaway tab memory). All screenshots are strictly purged on every new session start or manual Clear.
- **Automatic Garbage Cleanup:** Purge all previous screenshot data immediately when a new recording begins or when the user clicks "Clear".
- **Request Payload Capture:** In `injected.js`, intercept and sanitize outgoing request bodies (JSON, text, FormData) on `fetch` and `XMLHttpRequest`, masking sensitive keys (`password`, `token`, `secret`, `apiKey`).
- **Environment Context:** Collect OS, browser engine, screen resolution, viewport, device pixel ratio (DPR), language, and online status.
- **Developer-Actionable Markdown Export:** Format the Markdown report with a System Info table, numbered Steps to Reproduce, Collapsible API details (with Request Payload and Response), and Visual Screenshots.

### Non-Goals
- Full video / WebM screen recording (too heavy, exhausts storage, incompatible with Markdown clipboard paste).
- Cloud storage integration (S3/Cloudinary) — the extension remains 100% offline and privacy-respecting.
- Full packet proxy inspection (e.g. raw TCP/TLS headers).

### Anti-Goals
- Never storing uncompressed multi-megabyte PNG files in `chrome.storage.local`.
- Never persisting zombie image blobs across session resets.
- Never exposing unmasked credentials or auth tokens in exported bug reports.

---

## 3. Approaches Considered & Selected

| Approach | Description | Pros | Cons | Decision |
|---|---|---|---|---|
| **Approach 1: Event-Triggered Auto-Capture with FIFO Budget** | Capture compressed JPEG (65% quality) on failure + manual snapshot. Max 3 images in `chrome.storage.local`. | 100% local, fast, 1-click clipboard paste to Jira/GitHub, <= 180 KB footprint. | Slight JPEG compression. | **Selected** |
| **Approach 2: Full ZIP Bug Bundle via IndexedDB** | Store raw uncompressed PNGs and HAR network files; export as .zip download. | Perfect visual fidelity, unlimited size. | High friction for QA (downloading, unzipping, uploading multiple files to Jira). | Rejected |
| **Approach 3: External Cloud Upload** | Upload screenshots and logs to external S3/API backend. | Shareable URL links. | Requires external server, API keys, costs, and violates user privacy. | Rejected |

---

## 4. Data Schema Updates (`src/types/schema.ts`)

### Screenshot Artifact
```typescript
export interface ScreenshotArtifact {
  id: string;
  timestamp: number;
  trigger: 'error_network' | 'error_console' | 'manual';
  dataUrl: string; // JPEG data URL (quality 65%)
  url: string;
  label?: string;
}
```

### Environment Metadata
```typescript
export interface EnvironmentMetadata {
  os?: string;
  browser?: string;
  screenResolution?: { width: number; height: number };
  viewport: { width: number; height: number };
  devicePixelRatio?: number;
  language?: string;
  online?: boolean;
}
```

### Expanded Network Event
```typescript
export interface NetworkEvent {
  // Existing fields: id, category, type, timestamp, url, method, requestUrl, status, durationMs, error, responsePreview
  requestPayload?: string; // Sanitized request body (JSON/text truncated to 1024 chars)
}
```

### Expanded Recorded Session
```typescript
export interface RecordedSession {
  sessionId: string;
  metadata: SessionMetadata & {
    environment?: EnvironmentMetadata;
  };
  events: TrackedEvent[];
  screenshots?: ScreenshotArtifact[]; // Max 3 items enforced by Service Worker
}
```

---

## 5. Component Implementation Details

### 5.1 Service Worker (`src/background/service-worker.ts`)
1. **`captureScreenshot(trigger, tabId, label)` Method:**
   - Verifies target tab is active (`tab.active === true`) before capturing. If backgrounded, skips capture to prevent photographing unrelated tabs.
   - Calls `chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 65 })`.
   - Creates `ScreenshotArtifact` and appends to `this.state.currentSession.screenshots`.
   - Enforces sliding window:
     ```typescript
     if (this.state.currentSession.screenshots.length > 3) {
       this.state.currentSession.screenshots.shift(); // Remove oldest
     }
     ```
   - Persists to storage.
2. **Auto-Capture on Error:**
   - In `recordEvent`: if `isNetworkEvent(event) && event.status >= 400` or `isConsoleEvent(event)`, trigger `this.captureScreenshot(...)`.
   - Rate-limited to at most 1 screenshot per 1000ms to avoid burst captures during cascade errors.
3. **Session Reset Cleanup:**
   - In `startRecording(...)`: Explicitly initializes `currentSession.screenshots = []` and purges previous images.

### 5.2 Main World Interception (`src/main-world/injected.ts`)
1. **Request Body Extraction:**
   - In `window.fetch(url, init)`: Extract `init.body`.
   - In `XMLHttpRequest.send(body)`: Extract `body`.
2. **Sanitization Engine:**
   - Parse JSON if valid, recursively mask keys matching `/(password|token|secret|auth|api_?key|credential)/i`.
   - If string/form data, regex replace sensitive values with `[REDACTED]`.
   - Truncate payload string to max 1024 characters.
   - Include `requestPayload` in emitted `NetworkEvent` when HTTP status >= 400 or status === 0.

### 5.3 Client Environment Metadata Extraction (`src/ui/popup/popup.ts` / `content.ts`)
- On `startRecording`:
  - `os`: Parsed from `navigator.userAgent` or `navigator.userAgentData.platform`.
  - `browser`: Chrome version.
  - `screenResolution`: `{ width: window.screen.width, height: window.screen.height }`.
  - `viewport`: `{ width: window.innerWidth, height: window.innerHeight }`.
  - `devicePixelRatio`: `window.devicePixelRatio || 1`.
  - `language`: `navigator.language`.
  - `online`: `navigator.onLine`.

### 5.4 Markdown Exporter (`src/exporters/markdown.ts`)
Structure of exported bug report:
1. **Title & Header:** `## 🐛 Bug Reproduction Report`
2. **System & Environment Table:** OS, Browser, Screen Resolution, Viewport, DPR, Language.
3. **Steps to Reproduce:** Numbered list of user actions (clicks, inputs, keys, navigations).
4. **Failed Network Calls:**
   - Method, Request URL, HTTP Status, Duration.
   - Collapsible `<details><summary>Request Payload</summary>` block.
   - Collapsible `<details><summary>Response Preview</summary>` block.
5. **Console & Uncaught Errors:** Log message, Error level, Stack trace.
6. **Visual Evidence (Screenshots - Option C Hybrid):**
   - For each screenshot in `screenshots`:
     - Metadata line: `* **[Trigger]** (Timestamp, URL)`
     - Collapsible image block: `<details><summary>📸 View Image (Base64)</summary><img src="data:image/jpeg;base64,..." alt="Screenshot" width="600" /></details>`

### 5.5 Popup UI (`popup.html` and `src/ui/popup/popup.ts`)
1. **Controls:**
   - Add **"📸 Snapshot"** button (enabled only when `status === 'RECORDING'`).
   - Add **"🗑️ Clear"** button (enabled only when `status === 'IDLE'`, disabled during active recording to avoid accidental session disruption).
2. **Screenshot Gallery Strip:**
   - Displays compact badges for up to 3 thumbnails (e.g., `[📸 Error #1]`, `[📸 Manual]`).
   - Each item includes a 1-click **"📋 Copy Image"** button (writing raw image Blob to system clipboard via `navigator.clipboard.write([new ClipboardItem(...)])` for instant `Ctrl+V` pasting into GitHub/Jira/Slack) and a **"💾 Save"** button.

### 5.6 Builder Review Decisions
- **Screenshot Delivery in Markdown:** Option C selected (collapsible Base64 `<details>` in Markdown + 1-click clipboard binary image copy button in Popup for direct Jira/GitHub pasting).
- **Background Tab Capture Policy:** Silently skipped if the tab is inactive (`tab.active !== true`) to protect user privacy and prevent screenshotting unrelated personal tabs.
- **Clear Button Semantics:** Enabled exclusively in `IDLE` state; disabled during active `RECORDING`.

---

## 6. Verification and Testing Plan
1. **Unit Tests:**
   - `tests/schema.test.ts`: Verify `ScreenshotArtifact` type guards and `EnvironmentMetadata`.
   - `tests/injected.test.ts`: Verify request body extraction, JSON masking of passwords, and payload truncation.
   - `tests/service-worker.test.ts`: Verify FIFO sliding-window cap of 3 screenshots, auto-capture rate limiting, and session reset cleanup.
   - `tests/markdown-exporter.test.ts`: Verify environment table, collapsible request payloads, and screenshot sections.
2. **Build Verification:**
   - Multi-entry Vite compilation producing standalone IIFE bundles without external dependencies.
   - Vitest suite running 100% green.
