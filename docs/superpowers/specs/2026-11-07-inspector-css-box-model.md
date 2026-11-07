# Technical Specification: Inspector CSS & Box Model Inspection

## 1. Overview
Enhance the Live Element Inspector (`src/content-script/inspector.ts`) to extract and display computed CSS metrics alongside element tags, classes, and computed selectors.
When hovering over any element, the Inspector Tooltip Card presents:
- **Dimensions:** Width × Height in pixels (`rect.width` × `rect.height`), along with `display`.
- **Colors:** Text Color and Background Color with inline color swatches (`■`).
- **Box Model:** Formatted `padding` and `margin` values (shorthand or 4-side breakdown).
- **Typography:** Computed `font-size`, `font-family`, and `font-weight`.
- **Selector & Click-to-Copy:** Best selector with click-to-copy functionality and visual toast feedback.

## 2. Metrics Extraction Strategy
A helper function `extractComputedStyles(element: HTMLElement)` reads from `window.getComputedStyle(element)` and `element.getBoundingClientRect()`:
- `width`: `Math.round(rect.width)`
- `height`: `Math.round(rect.height)`
- `display`: `computed.display`
- `color`: `computed.color` (converted/displayed cleanly)
- `backgroundColor`: `computed.backgroundColor` (if `rgba(0, 0, 0, 0)` or `transparent`, indicates transparent)
- `padding`: `${computed.paddingTop} ${computed.paddingRight} ${computed.paddingBottom} ${computed.paddingLeft}`
- `margin`: `${computed.marginTop} ${computed.marginRight} ${computed.marginBottom} ${computed.marginLeft}`
- `fontSize`: `computed.fontSize`
- `fontFamily`: primary font family name (first family in comma-separated list, quotes stripped)
- `fontWeight`: `computed.fontWeight`

## 3. Tooltip Layout & Visual Formatting
- Semi-transparent dark background (`#0f172a`), border `#334155`, rounded corners, shadow.
- Width: clamp nicely up to 380px.
- Sections:
  1. Header: `<tag>` `#id` `role` `classes`
  2. Metrics Grid:
     - 📐 `Size: {width} × {height} px ({display})`
     - 🎨 `Color: ■ {color} | ■ {bgColor}`
     - 📦 `Padding: {p} | Margin: {m}`
     - 🔤 `Font: {fontSize} {fontFamily} ({fontWeight})`
  3. Computed Selector pill with copy instructions.
- Auto-clamping inside viewport so the tooltip never overflows window boundaries.
