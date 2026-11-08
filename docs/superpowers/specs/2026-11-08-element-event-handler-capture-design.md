# Element Event Handler & Function Name Capture Design

## Intent & Overview
When a tester or QA engineer interacts with an element (clicking a button, typing into a field, selecting a dropdown), Web Action Tracker currently records only CSS and DOM selectors (e.g. `#btn-submit`). Developers receiving the bug report often have to manually search through large codebases to locate which JavaScript function handles that interaction.

This feature captures the event handler function name or inline expression associated with the element and displays it:
1. In the **Popup UI Recent Timeline** (e.g. `👆 Click button (#btn-submit) ➔ fn: handleCheckout()`)
2. In the **Markdown Bug Reproduction Report** (e.g. `1. **Click:** Button **"Checkout"** (`#btn-submit`) | **Handler:** `handleCheckout()``)
3. In exported **JSON sessions**.

---

## Technical Architecture & Layered Extraction

Modern web applications bind event handlers in several ways. We use a 4-tier fallback extraction algorithm:

```
[User Action on Target Element]
       │
       ▼
1. Direct / Closest Ancestor Attributes
   - onclick, onchange, oninput, onkeydown
   - Framework attributes: @click, v-on:click, (click), ng-click, x-on:click, hx-post/hx-get
   - Semantic attributes: data-action, data-click, data-handler
       │ (if not found)
       ▼
2. React / Vue Fiber & Component Props
   - React: element[__reactProps$*]?.onClick / onChange / etc.
   - Vue: element.__vnode?.props?.onClick
       │ (if not found)
       ▼
3. DOM Level 0 Properties
   - element.onclick?.name || element.onchange?.name
       │ (if not found)
       ▼
4. MAIN-World Event Listener Registry (addEventListener)
   - Injected MAIN world patches EventTarget.prototype.addEventListener
   - Tags elements with attached function names (fn.name || 'anonymous')
```

### Ancestor Traversal
Users frequently click inside icons or text wrappers (e.g. `<span>` or `<svg>` inside `<button onclick="submitOrder()">`). If the immediate target has no handler, the extractor traverses up to `target.closest('button, a, [onclick], [data-action], [role="button"]')` (max 3 levels).

---

## Schema Changes

In `src/types/schema.ts`:

```typescript
export interface ElementHandlerMetadata {
  name?: string;     // e.g. "handleCheckout" or "submitOrder"
  raw?: string;      // e.g. "validateAndSubmit(1)" or "handleCheckout()"
  source?: 'inline' | 'react' | 'vue' | 'listener' | 'attribute';
}

export interface ActionEvent {
  // existing fields...
  handler?: ElementHandlerMetadata;
}
```

---

## UI & Exporter Enhancements

### 1. Popup Recent Timeline
- Formatted as:
  `👆 Click button (#btn-checkout) ➔ fn: handleCheckout()`
- Tooltip displays full handler detail if available.

### 2. Markdown Exporter
- Action step format:
  `1. **Click:** Button **"Checkout"** (`#btn-checkout`) | **Handler:** `handleCheckout()``
- If no handler is detected, gracefully formats without the handler suffix (preserving existing clean output).

---

## Error Handling & Privacy
- **Safe Evaluation:** Only function names or attribute strings are read; no user functions are invoked.
- **Length Truncation:** Long inline script snippets are capped at 100 characters to prevent report bloating.
- **Fail-safe:** If inspecting framework internals throws or encounters cross-origin iframe boundaries, catch errors and fall back gracefully to selector-only.
