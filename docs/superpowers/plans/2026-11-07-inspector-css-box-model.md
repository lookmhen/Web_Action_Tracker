# Inspector CSS & Box Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance the Live Element Inspector overlay to display computed dimensions, colors with visual swatches, box model (padding/margin), and typography.

**Architecture:** Extend `src/content-script/inspector.ts` with a dedicated style extractor `extractComputedStyles(element: HTMLElement)` that reads `window.getComputedStyle(element)` and formats box model shorthand, colors, and typography, rendering them cleanly into `__wat_inspector_card__`.

**Tech Stack:** TypeScript, Vanilla DOM APIs (`getComputedStyle`, `getBoundingClientRect`), Vitest with JSDOM.

**Spec:** `docs/superpowers/specs/2026-11-07-inspector-css-box-model.md`

## Global Constraints
- Zero runtime dependencies in content script.
- Content script must remain bundled as standalone IIFE into `dist/content.js`.
- All extracted strings must be safely sanitized (XSS-safe) before inserting into `card.innerHTML`.
- The tooltip card position must clamp within window boundaries to avoid overflow.

## Review Focus
1. Transparent or inherit background color handling (displaying "transparent" instead of confusing `rgba(0, 0, 0, 0)`).
2. Clean font family formatting (stripping quotes and extracting primary family).
3. Padding & margin shorthand compression (e.g. `8px 8px 8px 8px` -> `8px`).
4. Elements with 0 dimensions or offscreen coordinates.
5. DOM changes must not break click-to-copy selector behavior.

---

### Task 1: Style Extractor & Formatter Helper Functions

**Files:**
- Modify: `src/content-script/inspector.ts`
- Test: `tests/inspector.test.ts`

- [ ] **Step 1: Write failing tests for style extractor in `tests/inspector.test.ts`**
  - Add test verifying `extractComputedStyles` extracts:
    - `dimensions`: `${width} × ${height} px` and `display`
    - `color` and `backgroundColor` (with `transparent` label for `rgba(0, 0, 0, 0)`)
    - `padding` and `margin` formatted cleanly
    - `font`: `fontSize`, primary `fontFamily`, and `fontWeight`
  - Add test verifying tooltip card renders Size, Colors, Padding, Margin, and Font sections.

- [ ] **Step 2: Run tests to verify failure (RED)**
  - Run `npx vitest run tests/inspector.test.ts`

- [ ] **Step 3: Implement `extractComputedStyles` and formatters in `src/content-script/inspector.ts`**
  - Implement `formatBoxModel(top, right, bottom, left)` to convert identical values to shorthand.
  - Implement `extractComputedStyles(element: HTMLElement)`.
  - Update `handleMouseOver` in `createInspector()` to render the new CSS sections inside `card.innerHTML`.

- [ ] **Step 4: Run tests to verify success (GREEN)**
  - Run `npx vitest run tests/inspector.test.ts`

- [ ] **Step 5: Run full test suite and build**
  - Run `npx vitest run`
  - Run `npm run build`

- [ ] **Step 6: Commit changes**
  - `git commit -m "feat(inspector): display computed colors, dimensions, box model, and typography"`
