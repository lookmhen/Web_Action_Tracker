import { resolveElementSelectors, computeBestSelector } from '../utils/selectors';

export interface InspectorController {
  enable: () => void;
  disable: () => void;
  toggle: () => boolean;
  isEnabled: () => boolean;
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
      card.style.maxWidth = '340px';
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

  function showToast(message: string) {
    if (!toast) return;
    toast.textContent = message;
    toast.style.display = 'block';
    setTimeout(() => {
      if (toast) toast.style.display = 'none';
    }, 2000);
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

    card.innerHTML = `
      <div style="font-weight:700; color:#60a5fa; margin-bottom:2px;">${tagRole}</div>
      ${idOrTestId ? `<div>${idOrTestId}</div>` : ''}
      ${classes ? `<div>${classes}</div>` : ''}
      ${textPreview ? `<div>${textPreview}</div>` : ''}
      <div style="margin-top:4px; padding-top:4px; border-top:1px solid #334155; color:#34d399; font-weight:600;">
        ${escapeHtml(bestSelector)}
      </div>
      <div style="font-size:9px; color:#64748b; margin-top:2px;">Click to copy selector</div>
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

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(bestSelector).then(() => {
        showToast(`Copied: ${bestSelector}`);
      }).catch(() => {
        showToast(`Copied: ${bestSelector}`);
      });
    } else {
      showToast(`Copied: ${bestSelector}`);
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.altKey && (e.key === 'x' || e.key === 'X')) {
      e.preventDefault();
      toggle();
    }
  }

  function enable() {
    enabled = true;
    ensureElements();
    window.addEventListener('mouseover', handleMouseOver, true);
    window.addEventListener('click', handleClick, true);
  }

  function disable() {
    enabled = false;
    if (box) box.style.display = 'none';
    if (card) card.style.display = 'none';
    if (toast) toast.style.display = 'none';
    currentTarget = null;
    window.removeEventListener('mouseover', handleMouseOver, true);
    window.removeEventListener('click', handleClick, true);
  }

  function toggle(): boolean {
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
