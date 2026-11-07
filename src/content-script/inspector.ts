import { resolveElementSelectors, computeBestSelector } from '../utils/selectors';

export interface InspectorController {
  enable: () => void;
  disable: () => void;
  toggle: () => boolean;
  isEnabled: () => boolean;
}

export interface ComputedElementStyles {
  dimensions: string;
  display: string;
  color: string;
  backgroundColor: string;
  padding: string;
  margin: string;
  fontSize: string;
  fontFamily: string;
  fontWeight: string;
}

export function formatBoxModel(top = '0px', right = '0px', bottom = '0px', left = '0px'): string {
  if (top === bottom && right === left) {
    if (top === right) {
      return top;
    }
    return `${top} ${right}`;
  }
  if (right === left) {
    return `${top} ${right} ${bottom}`;
  }
  return `${top} ${right} ${bottom} ${left}`;
}

export function extractComputedStyles(element: HTMLElement, rect: DOMRect): ComputedElementStyles {
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);
  const dimensions = `${width} × ${height} px`;

  let display = 'block';
  let color = '#ffffff';
  let backgroundColor = 'transparent';
  let padding = '0px';
  let margin = '0px';
  let fontSize = '14px';
  let fontFamily = 'sans-serif';
  let fontWeight = '400';

  if (typeof window !== 'undefined' && window.getComputedStyle) {
    try {
      const cs = window.getComputedStyle(element);
      display = cs.display || 'block';
      color = cs.color || '#ffffff';

      const bg = cs.backgroundColor || '';
      if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') {
        backgroundColor = 'transparent';
      } else {
        backgroundColor = bg;
      }

      padding = formatBoxModel(cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft);
      margin = formatBoxModel(cs.marginTop, cs.marginRight, cs.marginBottom, cs.marginLeft);

      fontSize = cs.fontSize || '14px';

      const rawFamily = cs.fontFamily || 'sans-serif';
      fontFamily = rawFamily.split(',')[0].replace(/['"]/g, '').trim();

      fontWeight = cs.fontWeight || '400';
    } catch {
      // Ignore if styles cannot be computed
    }
  }

  return {
    dimensions,
    display,
    color,
    backgroundColor,
    padding,
    margin,
    fontSize,
    fontFamily,
    fontWeight
  };
}

function escapeHtml(str?: string | null): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function formatElementDetails(
  element: HTMLElement,
  selectors: ReturnType<typeof resolveElementSelectors>,
  bestSelector: string
): string {
  const rect = element.getBoundingClientRect();
  const styles = extractComputedStyles(element, rect);

  const lines: string[] = [];
  // Element selector at the very top as requested
  lines.push(`Selector: ${bestSelector}`);
  const tagRole = selectors.role ? `<${selectors.tag}> (role: ${selectors.role})` : `<${selectors.tag}>`;
  lines.push(`Tag: ${tagRole}`);

  if (selectors.id) lines.push(`ID: #${selectors.id}`);
  if (selectors.testId) lines.push(`TestID: ${selectors.testId}`);
  if (selectors.classes && selectors.classes.length > 0) lines.push(`Class: .${selectors.classes.join('.')}`);
  if (selectors.text) lines.push(`Text: "${selectors.text}"`);

  lines.push(`Size: ${styles.dimensions} (${styles.display})`);
  lines.push(`Color: ${styles.color} | Bg: ${styles.backgroundColor}`);
  lines.push(`Box: Padding: ${styles.padding} | Margin: ${styles.margin}`);
  lines.push(`Font: ${styles.fontSize} ${styles.fontFamily} (weight: ${styles.fontWeight})`);

  return lines.join('\n');
}

export function createInspector(): InspectorController {
  let enabled = false;
  let currentTarget: HTMLElement | null = null;

  // Overlay elements
  let box: HTMLDivElement | null = null;
  let card: HTMLDivElement | null = null;
  let toast: HTMLDivElement | null = null;

  function ensureElements() {
    if (!box) {
      box = document.createElement('div');
      box.id = '__wat_inspector_box__';
      box.style.position = 'fixed';
      box.style.pointerEvents = 'none';
      box.style.zIndex = '2147483647';
      box.style.border = '2px solid #2563eb';
      box.style.backgroundColor = 'rgba(37, 99, 235, 0.12)';
      box.style.borderRadius = '3px';
      box.style.display = 'none';
      box.style.boxSizing = 'border-box';
      document.body.appendChild(box);
    }

    if (!card) {
      card = document.createElement('div');
      card.id = '__wat_inspector_card__';
      card.style.position = 'fixed';
      card.style.pointerEvents = 'none';
      card.style.zIndex = '2147483647';
      card.style.backgroundColor = '#0f172a';
      card.style.color = '#f8fafc';
      card.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
      card.style.fontSize = '11px';
      card.style.padding = '8px 12px';
      card.style.borderRadius = '6px';
      card.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.3)';
      card.style.border = '1px solid #334155';
      card.style.display = 'none';
      card.style.maxWidth = '360px';
      card.style.lineHeight = '1.45';
      card.style.boxSizing = 'border-box';
      document.body.appendChild(card);
    }

    if (!toast) {
      toast = document.createElement('div');
      toast.id = '__wat_inspector_toast__';
      toast.style.position = 'fixed';
      toast.style.bottom = '24px';
      toast.style.right = '24px';
      toast.style.zIndex = '2147483647';
      toast.style.backgroundColor = '#10b981';
      toast.style.color = '#ffffff';
      toast.style.fontFamily = 'sans-serif';
      toast.style.fontSize = '12px';
      toast.style.fontWeight = '600';
      toast.style.padding = '8px 16px';
      toast.style.borderRadius = '6px';
      toast.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.2)';
      toast.style.display = 'none';
      document.body.appendChild(toast);
    }
  }

  let toastTimer: any = null;

  function showToast(message: string, durationMs = 2500) {
    ensureElements();
    if (!toast) return;
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
    toast.textContent = message;
    toast.style.display = 'block';
    toastTimer = setTimeout(() => {
      if (toast) toast.style.display = 'none';
      toastTimer = null;
    }, durationMs);
  }

  function handleMouseOver(e: MouseEvent) {
    if (!enabled) return;
    const target = e.target as HTMLElement | null;
    if (!target || target === box || target === card || target === toast) return;
    if (target.id?.startsWith('__wat_')) return;

    currentTarget = target;
    ensureElements();

    const rect = target.getBoundingClientRect();
    if (!box || !card) return;

    // Position highlight box
    box.style.top = `${rect.top}px`;
    box.style.left = `${rect.left}px`;
    box.style.width = `${rect.width}px`;
    box.style.height = `${rect.height}px`;
    box.style.display = 'block';

    // Compute selectors info
    const selectors = resolveElementSelectors(target);
    const bestSelector = computeBestSelector(selectors);
    const styles = extractComputedStyles(target, rect);

    const tagRole = selectors.role 
      ? `&lt;${escapeHtml(selectors.tag)}&gt; (role: ${escapeHtml(selectors.role)})` 
      : `&lt;${escapeHtml(selectors.tag)}&gt;`;
    const idOrTestId = selectors.testId 
      ? `testid: <span style="color:#38bdf8">${escapeHtml(selectors.testId)}</span>` 
      : (selectors.id ? `id: <span style="color:#a78bfa">#${escapeHtml(selectors.id)}</span>` : '');
    const classes = selectors.classes && selectors.classes.length > 0
      ? `class: <span style="color:#94a3b8">.${escapeHtml(selectors.classes.join('.'))}</span>`
      : '';
    const textPreview = selectors.text ? `text: <span style="color:#fbbf24">"${escapeHtml(selectors.text)}"</span>` : '';

    const bgPreview = styles.backgroundColor !== 'transparent'
      ? `<span><span style="color:#94a3b8">Bg:</span> <span style="display:inline-block; width:9px; height:9px; border-radius:2px; background-color:${escapeHtml(styles.backgroundColor)}; border:1px solid #475569; vertical-align:middle;"></span> <span>${escapeHtml(styles.backgroundColor)}</span></span>`
      : '<span style="color:#64748b;">(bg: transparent)</span>';

    card.innerHTML = `
      <div style="font-weight:700; color:#60a5fa; margin-bottom:2px;">${tagRole}</div>
      ${idOrTestId ? `<div>${idOrTestId}</div>` : ''}
      ${classes ? `<div>${classes}</div>` : ''}
      ${textPreview ? `<div>${textPreview}</div>` : ''}

      <div style="margin-top:6px; padding-top:6px; border-top:1px solid #334155; font-size:10px; color:#cbd5e1; display:flex; flex-direction:column; gap:3px;">
        <div>
          <span style="color:#94a3b8;">📐 Size:</span> <strong style="color:#f8fafc;">${escapeHtml(styles.dimensions)}</strong> <span style="color:#64748b;">(${escapeHtml(styles.display)})</span>
        </div>
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <span>
            <span style="color:#94a3b8;">🎨 Color:</span>
            <span style="display:inline-block; width:9px; height:9px; border-radius:2px; background-color:${escapeHtml(styles.color)}; border:1px solid #475569; vertical-align:middle;"></span>
            <span>${escapeHtml(styles.color)}</span>
          </span>
          ${bgPreview}
        </div>
        <div>
          <span style="color:#94a3b8;">📦 Box:</span> p: <strong style="color:#38bdf8">${escapeHtml(styles.padding)}</strong> | m: <strong style="color:#fb923c">${escapeHtml(styles.margin)}</strong>
        </div>
        <div>
          <span style="color:#94a3b8;">🔤 Font:</span> ${escapeHtml(styles.fontSize)} ${escapeHtml(styles.fontFamily)} <span style="color:#64748b;">(${escapeHtml(styles.fontWeight)})</span>
        </div>
      </div>

      <div style="margin-top:6px; padding-top:4px; border-top:1px solid #334155; color:#34d399; font-weight:600; word-break:break-all;">
        ${escapeHtml(bestSelector)}
      </div>
      <div style="font-size:9px; color:#64748b; margin-top:2px;">Click to copy element &amp; details</div>
    `;
    card.style.display = 'block';

    // Clamp card position inside viewport
    const cardRect = card.getBoundingClientRect();
    let top = rect.top - cardRect.height - 8;
    if (top < 8) {
      top = rect.bottom + 8; // flip below if not enough room above
    }
    let left = rect.left;
    if (left + cardRect.width > window.innerWidth - 8) {
      left = window.innerWidth - cardRect.width - 8;
    }
    if (left < 8) left = 8;

    card.style.top = `${top}px`;
    card.style.left = `${left}px`;
  }

  function handleClick(e: MouseEvent) {
    if (!enabled) return;
    const target = e.target as HTMLElement | null;
    if (!target || target.id?.startsWith('__wat_')) return;

    e.preventDefault();
    e.stopPropagation();

    const selectors = resolveElementSelectors(target);
    const bestSelector = computeBestSelector(selectors);
    const fullDetails = formatElementDetails(target, selectors, bestSelector);

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(fullDetails).then(() => {
        showToast(`Copied details for ${bestSelector}`);
      }).catch(() => {
        showToast(`Copied details for ${bestSelector}`);
      });
    } else {
      showToast(`Copied details for ${bestSelector}`);
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.altKey && (e.key === 'x' || e.key === 'X')) {
      e.preventDefault();
      toggle();
    }
  }

  let lastToggleTime = 0;

  function enable() {
    enabled = true;
    ensureElements();
    showToast('🔍 Inspector: ON (Click element to copy, Alt+X to exit)', 3000);
    window.addEventListener('mouseover', handleMouseOver, true);
    window.addEventListener('click', handleClick, true);
  }

  function disable() {
    enabled = false;
    if (box) box.style.display = 'none';
    if (card) card.style.display = 'none';
    showToast('Inspector: OFF', 1500);
    currentTarget = null;
    window.removeEventListener('mouseover', handleMouseOver, true);
    window.removeEventListener('click', handleClick, true);
  }

  function toggle(): boolean {
    const now = Date.now();
    if (now - lastToggleTime < 300) {
      return enabled;
    }
    lastToggleTime = now;

    if (enabled) {
      disable();
    } else {
      enable();
    }
    return enabled;
  }

  function isEnabled(): boolean {
    return enabled;
  }

  // Keyboard shortcut Alt+X is active globally
  window.addEventListener('keydown', handleKeyDown, true);

  return {
    enable,
    disable,
    toggle,
    isEnabled
  };
}
