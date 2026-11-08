# Element Event Handler & React Component Props Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture element event handlers, React component names, and sanitized component props on user interactions, and display them in the Popup UI timeline and Markdown bug reports.

**Architecture:** A layered extractor inspects target elements and clickable ancestors for React fiber metadata (`__reactFiber$`, `__reactProps$`), HTML attributes (`onclick`, `@click`, `data-action`), DOM Level 0 properties, and MAIN-world `addEventListener` registrations. Captured metadata is stored in `ActionEvent.handler` and formatted in UI and exports.

**Tech Stack:** TypeScript, Chrome Extension Manifest V3 (Content Script, Injected Script, Popup UI), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-08-element-event-handler-capture-design.md`

## Global Constraints

- Standalone zero-dependency build in `dist/`.
- No sensitive values leaked: React props matching `/(password|token|secret|auth|api_?key|credential)/i` must be redacted to `"[REDACTED]"`.
- Large objects, DOM nodes, functions, and React `children` must be stripped from captured props.
- Max 5 props and max string length 200 characters per interaction.
- Strict backwards compatibility: if an element has no handler or is not a React component, format cleanly as selector-only without errors.

## Review Focus

1. Clicking child icon or `<span>` inside a React button captures the parent button's component and handler.
2. React props with circular references or DOM elements do not throw when sanitized.
3. Elements with no handler or non-React apps fall back to selector-only without throwing.
4. Anonymous arrow function handlers (`() => doSomething()`) extract clean representation without dumping massive code blocks.
5. Injected `addEventListener` monkey-patch does not disrupt normal page event propagation or host page performance.

---

### Task 1: Schema & Type Definitions

**Files:**
- Modify: `src/types/schema.ts`
- Test: `tests/schema.test.ts`

**Interfaces:**
- Produces: `ElementHandlerMetadata` interface.
- Produces: `ActionEvent.handler?: ElementHandlerMetadata`.

- [ ] **Step 1: Write failing test in `tests/schema.test.ts`**

```typescript
it('validates ElementHandlerMetadata and ActionEvent.handler', () => {
  const handler: ElementHandlerMetadata = {
    name: 'handleCheckout',
    raw: 'handleCheckout()',
    source: 'react',
    componentName: 'OrderButton',
    props: { orderId: 'ORD-123', total: 450 }
  };
  expect(handler.name).toBe('handleCheckout');
  expect(handler.componentName).toBe('OrderButton');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/schema.test.ts`
Expected: FAIL with `ElementHandlerMetadata` not exported.

- [ ] **Step 3: Implement `ElementHandlerMetadata` in `src/types/schema.ts`**

Export `ElementHandlerMetadata` and add `handler?: ElementHandlerMetadata` to `ActionEvent`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/schema.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/types/schema.ts tests/schema.test.ts
git commit -m "feat(schema): add ElementHandlerMetadata to ActionEvent"
```

---

### Task 2: MAIN-World `addEventListener` Interception

**Files:**
- Modify: `src/main-world/injected.ts`
- Test: `tests/injected.test.ts`

**Interfaces:**
- Produces: Element tagging on `addEventListener` with handler name in `__wat_listeners__`.

- [ ] **Step 1: Write failing test for `addEventListener` listener registration in `tests/injected.test.ts`**

```typescript
it('records listener function names on elements when addEventListener is called', () => {
  setupMainWorldInterception();
  const btn = document.createElement('button');
  function onCheckoutClick() {}
  btn.addEventListener('click', onCheckoutClick);

  const listeners = (btn as any).__wat_listeners__?.['click'];
  expect(listeners).toBeDefined();
  expect(listeners).toContain('onCheckoutClick');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/injected.test.ts`
Expected: FAIL with `__wat_listeners__` undefined.

- [ ] **Step 3: Implement `addEventListener` monkey-patch in `src/main-world/injected.ts`**

Monkey-patch `EventTarget.prototype.addEventListener`. When target is an `Element`, register `fn.name || 'anonymous'` under `(this as any).__wat_listeners__[type]`. Call original `addEventListener`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/injected.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main-world/injected.ts tests/injected.test.ts
git commit -m "feat(main-world): track element event listener function names via addEventListener"
```

---

### Task 3: Handler & React Props Extractor Utility

**Files:**
- Create: `src/utils/handlers.ts`
- Test: `tests/handlers.test.ts`

**Interfaces:**
- Produces: `resolveElementHandler(element: HTMLElement, eventType: string): ElementHandlerMetadata | undefined`
- Produces: `sanitizeReactProps(rawProps: any): Record<string, any>`

- [ ] **Step 1: Write failing tests in `tests/handlers.test.ts`**

Test scenarios:
1. Inline attribute `onclick="submitForm(1)"` on element.
2. Traversal to closest ancestor button with `onclick`.
3. React fiber component name and props extraction (`__reactFiber$`, `__reactProps$`) with sensitive key masking.
4. Attached listener tags (`__wat_listeners__`).
5. Safe fallback to undefined when no handler is present.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/handlers.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement `resolveElementHandler` and `sanitizeReactProps` in `src/utils/handlers.ts`**

Implement 4-tier inspection:
1. React fiber props & component name (`__reactFiber$*`, `__reactProps$*`).
2. Inline attributes (`onclick`, `onchange`, `@click`, `data-action`) on target or `target.closest(...)`.
3. Vue props (`__vnode`) and DOM Level 0 (`element.onclick`).
4. Main-world listener registry (`__wat_listeners__`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/handlers.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/handlers.ts tests/handlers.test.ts
git commit -m "feat(utils): add element event handler and React props extractor"
```

---

### Task 4: Content Script Event Handler Integration

**Files:**
- Modify: `src/content-script/content.ts`
- Test: `tests/content.test.ts`

**Interfaces:**
- Consumes: `resolveElementHandler(target, eventType)` from `src/utils/handlers.ts`.
- Produces: `ActionEvent` with populated `handler` property.

- [ ] **Step 1: Write failing test in `tests/content.test.ts`**

```typescript
it('attaches element handler metadata to ActionEvent when button has onclick or react props', () => {
  const btn = document.createElement('button');
  btn.setAttribute('onclick', 'handleClick()');
  document.body.appendChild(btn);

  let capturedAction: ActionEvent | null = null;
  const evt = new MouseEvent('click', { bubbles: true });
  Object.defineProperty(evt, 'target', { value: btn });

  handleDomEvent(evt, (action) => {
    capturedAction = action;
  });

  expect(capturedAction).toBeDefined();
  expect(capturedAction?.handler?.raw).toBe('handleClick()');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/content.test.ts`
Expected: FAIL with `handler` undefined.

- [ ] **Step 3: Update `handleDomEvent` in `src/content-script/content.ts`**

Invoke `resolveElementHandler(target, eventType)` and assign to `actionEvent.handler`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/content.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/content-script/content.ts tests/content.test.ts
git commit -m "feat(content): integrate handler and React metadata into recorded ActionEvent"
```

---

### Task 5: Markdown Exporter Formatting

**Files:**
- Modify: `src/exporters/markdown.ts`
- Test: `tests/markdown-exporter.test.ts`

**Interfaces:**
- Produces: Markdown steps displaying React component name, props, and handler function.

- [ ] **Step 1: Write failing test in `tests/markdown-exporter.test.ts`**

```typescript
it('formats React component name, props, and handler in markdown steps', () => {
  const session: RecordedSession = {
    sessionId: 's1',
    metadata: { startUrl: 'https://app.com', userAgent: 'Chrome', viewport: { width: 1920, height: 1080 }, startedAt: 100 },
    events: [
      {
        id: '1', category: 'action', type: 'click', timestamp: 101, url: 'https://app.com',
        selectors: { tag: 'button', id: 'btn-pay', css: '#btn-pay' },
        handler: {
          name: 'handlePayment',
          componentName: 'OrderButton',
          props: { orderId: 'ORD-999', total: 450 }
        }
      }
    ]
  };

  const md = exportToMarkdown(session);
  expect(md).toContain('<OrderButton orderId="ORD-999" total=450 />');
  expect(md).toContain('Handler: `handlePayment`');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/markdown-exporter.test.ts`
Expected: FAIL with missing component and handler strings.

- [ ] **Step 3: Update `formatActionStep` in `src/exporters/markdown.ts`**

Format React component and handler details in step output.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/markdown-exporter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/exporters/markdown.ts tests/markdown-exporter.test.ts
git commit -m "feat(exporter): include React component, props, and handler in markdown report"
```

---

### Task 6: Popup UI Timeline Formatting

**Files:**
- Modify: `src/ui/popup/popup.ts`
- Test: `tests/popup.test.ts`

**Interfaces:**
- Produces: Popup timeline item displaying `➔ <Component props>.onEvent: fnName` or `➔ fn: fnName`.

- [ ] **Step 1: Write failing test in `tests/popup.test.ts`**

```typescript
it('displays handler and React component in recent timeline items', () => {
  const sessionWithHandler: RecordedSession = {
    sessionId: 's1',
    metadata: { startUrl: 'https://app.com', userAgent: 'Chrome', viewport: { width: 1920, height: 1080 }, startedAt: 100 },
    events: [
      {
        id: '1', category: 'action', type: 'click', timestamp: 101, url: 'https://app.com',
        selectors: { tag: 'button', id: 'btn-pay', css: '#btn-pay' },
        handler: { name: 'handlePayment', componentName: 'OrderButton' }
      }
    ]
  };

  setupPopupHandlers({ sendMessage: vi.fn().mockResolvedValue({}), getActiveTab: vi.fn().mockResolvedValue({ id: 101 }), initialSession: sessionWithHandler });
  const eventList = document.getElementById('event-list');
  expect(eventList?.innerHTML).toContain('&lt;OrderButton&gt;');
  expect(eventList?.innerHTML).toContain('handlePayment');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/popup.test.ts`
Expected: FAIL with missing handler string in timeline.

- [ ] **Step 3: Update `renderTimeline` in `src/ui/popup/popup.ts`**

Append handler / component label to action event text in timeline items.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/popup.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/popup/popup.ts tests/popup.test.ts
git commit -m "feat(popup): render React component and handler in recent timeline"
```

---

### Task 7: Full Test Suite Verification & Production Build

**Files:**
- Test: All test suites (`tests/**/*.test.ts`)
- Output: `dist/`

- [ ] **Step 1: Run full test suite across all test files**

Run: `npx vitest run`
Expected: All tests PASS (80+ tests green).

- [ ] **Step 2: Compile production bundles with Vite**

Run: `npm run build`
Expected: Build passes cleanly with updated `content.js`, `injected.js`, `popup.js`, and `service-worker.js`.

- [ ] **Step 3: Verification & Integration**

Verify build artifacts in `dist/`.
Commit and merge feature branch into `main`.
