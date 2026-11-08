# Element Event Handler & React Component Props Capture Design

## Intent & Overview
When a tester or QA engineer interacts with an element (clicking a button, typing into a field, selecting a dropdown), Web Action Tracker currently records only CSS and DOM selectors (e.g. `#btn-submit`). Developers receiving the bug report often have to manually search through large codebases to locate which JavaScript function handles that interaction and what state/props were passed into the component.

This feature captures:
1. The **event handler function name** or inline expression (e.g. `handleCheckout()`, `onSubmit`)
2. The **React / Framework Component Name** (e.g. `<OrderButton>`, `<ProductCard>`)
3. Sanitized **React Props** passed to the component (e.g. `orderId: "ORD-999"`, `amount: 450`)

It surfaces this intelligence:
- In the **Popup UI Recent Timeline** (e.g. `👆 Click button (#btn-pay) ➔ <OrderButton orderId="ORD-999">.onClick: handlePayment()`)
- In the **Markdown Bug Reproduction Report** with component metadata and handler
- In exported **JSON sessions**.

---

## Technical Architecture & Layered Extraction

Modern web applications bind event handlers in several ways. We use a 4-tier fallback extraction algorithm:

```
[User Action on Target Element]
       │
       ▼
1. React Fiber & Component Inspection (if React app)
   - Inspects DOM element for __reactFiber$* and __reactProps$*
   - Traverses to parent fiber to extract component displayName/name (e.g. "OrderButton")
   - Sanitizes and extracts relevant props (orderId, amount, status, etc.)
   - Extracts onClick/onChange/onSubmit handler function name
       │
       ▼
2. Direct / Closest Ancestor Attributes
   - onclick, onchange, oninput, onkeydown
   - Framework attributes: @click, v-on:click, (click), ng-click, x-on:click, hx-post/hx-get
   - Semantic attributes: data-action, data-click, data-handler
       │ (if not found)
       ▼
3. Vue Component & DOM Level 0 Properties
   - Vue: element.__vnode?.props?.onClick
   - DOM: element.onclick?.name || element.onchange?.name
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
  name?: string;               // e.g. "handleCheckout" or "submitOrder"
  raw?: string;                // e.g. "validateAndSubmit(1)" or "handleCheckout()"
  source?: 'inline' | 'react' | 'vue' | 'listener' | 'attribute';
  componentName?: string;       // e.g. "OrderButton" or "ProductCard"
  props?: Record<string, any>; // Sanitized props (e.g. { orderId: "ORD-999", amount: 450 })
}

export interface ActionEvent {
  // existing fields...
  handler?: ElementHandlerMetadata;
}
```

---

## React Props Sanitization & Privacy
- **Filtered Props:** Exclude `children`, `style`, `className`, `ref`, `key`, DOM elements, and internal functions.
- **Redaction:** Any prop whose key matches `/(password|token|secret|auth|api_?key|credential)/i` is redacted to `"[REDACTED]"`.
- **Size Cap:** Maximum 5 props captured, max string length 200 chars. Non-primitive objects are omitted or truncated to prevent circular references.

---

## UI & Exporter Enhancements

### 1. Popup Recent Timeline
- Formatted as:
  `👆 Click button (#btn-pay) ➔ <OrderButton orderId="ORD-999">.onClick: handlePayment()`
  or for non-React:
  `👆 Click button (#btn-pay) ➔ fn: handlePayment()`

### 2. Markdown Exporter
- Action step format:
  ```markdown
  1. **Click:** Button **"Pay"** (`#btn-pay`)
     * **React Component:** `<OrderButton orderId="ORD-999" amount={450} />`
     * **Handler:** `handlePayment()`
  ```
- If non-React with handler only:
  `1. **Click:** Button **"Pay"** (`#btn-pay`) | **Handler:** `handlePayment()``
- If neither exists, renders cleanly as before.
