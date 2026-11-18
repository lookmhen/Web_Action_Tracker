import { ElementSelectors } from '../types/schema';

// Regex to identify dynamic CSS-in-JS or generated class hashes (e.g. css-1x8a2b, sc-bwzfXH)
const DYNAMIC_CLASS_REGEX = /(^css-[a-zA-Z0-9]+$|^sc-[a-zA-Z0-9]+$|__[a-zA-Z0-9]{5,}$)/;
const DYNAMIC_ID_REGEX = /(^:r[a-zA-Z0-9]+:?$|^ember\d+$|^__)/;

export function isDynamicClass(cls: string): boolean {
  return DYNAMIC_CLASS_REGEX.test(cls);
}

export function isDynamicId(id: string): boolean {
  return DYNAMIC_ID_REGEX.test(id);
}

function getSafeElementId(element: Element): string {
  const raw = (element as HTMLElement).id;
  if (typeof raw === 'string') return raw;
  return element.getAttribute?.('id') || '';
}

export function filterStableClasses(classList: DOMTokenList | string[]): string[] {
  const classes = Array.isArray(classList) ? classList : Array.from(classList);
  return classes
    .filter(c => c && typeof c === 'string' && c.trim().length > 0 && !isDynamicClass(c))
    .slice(0, 3);
}

export function truncateText(text: string | null | undefined, maxLen = 30): string | undefined {
  if (!text) return undefined;
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length === 0) return undefined;
  if (clean.length <= maxLen) return clean;
  const cut = Math.max(0, maxLen - 3);
  return `${clean.substring(0, cut)}...`;
}

export function getElementTestId(element: Element): string | undefined {
  return (
    element.getAttribute('data-testid') ||
    element.getAttribute('data-test') ||
    element.getAttribute('data-qa') ||
    element.getAttribute('data-cy') ||
    undefined
  );
}

export function getElementRole(element: Element): string | undefined {
  const explicitRole = element.getAttribute('role');
  if (explicitRole) return explicitRole;

  const tag = element.tagName.toLowerCase();
  switch (tag) {
    case 'button': return 'button';
    case 'a': return element.hasAttribute('href') ? 'link' : undefined;
    case 'input': {
      const type = (element as HTMLInputElement).type?.toLowerCase();
      if (type === 'button' || type === 'submit' || type === 'reset') return 'button';
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      return 'textbox';
    }
    case 'textarea': return 'textbox';
    case 'select': return 'combobox';
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6': return 'heading';
    default: return undefined;
  }
}

export function getAccessibleName(element: Element): string | undefined {
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel.trim();

  const title = element.getAttribute('title');
  if (title) return title.trim();

  const nameAttr = element.getAttribute('name');
  if (nameAttr) return nameAttr.trim();

  return undefined;
}

export function generateCssSelector(element: Element): string {
  const safeId = getSafeElementId(element);
  if (safeId && !isDynamicId(safeId)) {
    return `#${safeId}`;
  }

  const testId = getElementTestId(element);
  if (testId) {
    return `[data-testid="${testId}"]`;
  }

  const tag = element.tagName.toLowerCase();
  const stableClasses = filterStableClasses(element.classList);
  if (stableClasses.length > 0) {
    try {
      const escapeFn = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
        ? CSS.escape
        : (str: string) => str.replace(/([:\[\]\/\\#.,?*+~'`!@$^=<>|{}()])/g, '\\$1');
      const escaped = stableClasses.map(escapeFn).join('.');
      const classSelector = `${tag}.${escaped}`;
      if (document.querySelectorAll(classSelector).length === 1) {
        return classSelector;
      }
    } catch {
      // Fall through to parent path generation if selector query fails
    }
  }

  // Fallback to parent path
  const path: string[] = [];
  let current: Element | null = element;
  while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body && current !== document.documentElement) {
    let selector = current.tagName.toLowerCase();
    const currentId = getSafeElementId(current);
    if (currentId && !isDynamicId(currentId)) {
      selector += `#${currentId}`;
      path.unshift(selector);
      break;
    } else {
      let sibling = current;
      let nth = 1;
      while (sibling.previousElementSibling) {
        sibling = sibling.previousElementSibling;
        if (sibling.tagName.toLowerCase() === current.tagName.toLowerCase()) {
          nth++;
        }
      }
      if (nth > 1) {
        selector += `:nth-of-type(${nth})`;
      }
      path.unshift(selector);
    }
    current = current.parentElement;
  }

  return path.join(' > ') || tag;
}

export function resolveElementSelectors(element: Element): ElementSelectors {
  const tag = element.tagName.toLowerCase();
  const testId = getElementTestId(element);
  const rawId = getSafeElementId(element);
  const id = rawId && !isDynamicId(rawId) ? rawId : undefined;
  const role = getElementRole(element);
  const name = getAccessibleName(element);
  const text = truncateText(element.textContent);
  const classes = filterStableClasses(element.classList);
  const css = generateCssSelector(element);

  return {
    tag,
    testId,
    id,
    role,
    name,
    text,
    classes: classes.length > 0 ? classes : undefined,
    css
  };
}

export function computeBestSelector(selectors: ElementSelectors): string {
  if (selectors.testId) {
    return `[data-testid="${selectors.testId}"]`;
  }
  if (selectors.id) {
    return `#${selectors.id}`;
  }
  if (selectors.name && (selectors.tag === 'input' || selectors.tag === 'textarea' || selectors.tag === 'select')) {
    return `${selectors.tag}[name="${selectors.name}"]`;
  }
  if (selectors.classes && selectors.classes.length > 0) {
    return `${selectors.tag}.${selectors.classes[0]}`;
  }
  return selectors.css;
}
