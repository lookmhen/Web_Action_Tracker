import { ElementHandlerMetadata } from '../types/schema';

const SENSITIVE_KEY_REGEX = /(password|token|secret|auth|api_?key|credential)/i;
const IGNORED_PROP_KEYS = new Set([
  'children',
  'className',
  'style',
  'ref',
  'key',
  'dangerouslySetInnerHTML'
]);

export function sanitizeReactProps(rawProps: any): Record<string, any> {
  if (!rawProps || typeof rawProps !== 'object') {
    return {};
  }

  const result: Record<string, any> = {};
  let count = 0;

  for (const [key, value] of Object.entries(rawProps)) {
    if (count >= 5) break;
    if (IGNORED_PROP_KEYS.has(key)) continue;
    if (typeof value === 'function') continue;

    if (SENSITIVE_KEY_REGEX.test(key)) {
      result[key] = '[REDACTED]';
      count++;
      continue;
    }

    if (typeof value === 'string') {
      result[key] = value.length > 100 ? `${value.substring(0, 97)}...` : value;
      count++;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      result[key] = value;
      count++;
    } else if (value === null || value === undefined) {
      result[key] = value;
      count++;
    } else if (typeof value === 'object') {
      // Safe shallow serialization for simple objects or arrays
      try {
        const json = JSON.stringify(value);
        if (json && json.length <= 100) {
          result[key] = JSON.parse(json);
          count++;
        }
      } catch {
        // Skip circular references or DOM references
      }
    }
  }

  return result;
}

function extractFunctionName(rawSnippet?: string | null): string | undefined {
  if (!rawSnippet) return undefined;
  const trimmed = rawSnippet.trim();
  const match = trimmed.match(/^([a-zA-Z0-9_$]+)\s*\(/);
  if (match) return match[1];
  const identMatch = trimmed.match(/^([a-zA-Z0-9_$]+)$/);
  if (identMatch) return identMatch[1];
  return undefined;
}

function getReactProps(el: HTMLElement): any {
  for (const key in el) {
    if (key.startsWith('__reactProps$')) {
      return (el as any)[key];
    }
  }
  return null;
}

function getReactFiber(el: HTMLElement): any {
  for (const key in el) {
    if (key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')) {
      return (el as any)[key];
    }
  }
  return null;
}

function getReactComponentName(fiber: any): string | undefined {
  let curr = fiber;
  while (curr) {
    if (curr.type) {
      const type = curr.type;
      if (typeof type === 'function') {
        const name = type.displayName || type.name;
        if (name && name !== 'Anonymous') return name;
      } else if (typeof type === 'object' && type !== null) {
        const name = type.displayName || type.name;
        if (name && name !== 'Anonymous') return name;
      }
    }
    curr = curr.return;
  }
  return undefined;
}

export function resolveElementHandler(
  element: HTMLElement,
  eventType: string
): ElementHandlerMetadata | undefined {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) {
    return undefined;
  }

  // Find candidate element chain: element itself + closest interactive ancestor
  const candidateChain: HTMLElement[] = [element];
  const closestInteractive = element.closest?.('button, a, [onclick], [data-action], [role="button"]') as HTMLElement | null;
  if (closestInteractive && closestInteractive !== element) {
    candidateChain.push(closestInteractive);
  }

  for (const el of candidateChain) {
    // 1. React Inspection
    const reactProps = getReactProps(el);
    const reactFiber = getReactFiber(el);

    if (reactProps || reactFiber) {
      const handlerPropName = eventType === 'click' ? 'onClick'
        : eventType === 'change' ? 'onChange'
        : eventType === 'input' ? 'onChange'
        : eventType === 'keydown' ? 'onKeyDown'
        : `on${eventType.charAt(0).toUpperCase()}${eventType.slice(1)}`;

      const fn = reactProps?.[handlerPropName] || reactProps?.onClick;
      const fnName = typeof fn === 'function' ? (fn.name || 'anonymous') : undefined;
      const componentName = getReactComponentName(reactFiber);
      const sanitizedProps = reactProps ? sanitizeReactProps(reactProps) : undefined;

      if (fnName || componentName) {
        return {
          name: fnName,
          source: 'react',
          componentName,
          props: sanitizedProps && Object.keys(sanitizedProps).length > 0 ? sanitizedProps : undefined
        };
      }
    }

    // 2. Inline HTML Attributes & Framework Bindings
    const eventAttr = `on${eventType}`;
    const inlineAttr = el.getAttribute(eventAttr);
    if (inlineAttr) {
      return {
        raw: inlineAttr,
        name: extractFunctionName(inlineAttr),
        source: 'inline'
      };
    }

    // Framework event attributes
    const frameworkAttrs = [`@${eventType}`, `v-on:${eventType}`, `(${eventType})`, `ng-${eventType}`, `data-action`, `data-click`, `data-handler`];
    for (const attr of frameworkAttrs) {
      const val = el.getAttribute(attr);
      if (val) {
        return {
          raw: val,
          name: extractFunctionName(val),
          source: 'attribute'
        };
      }
    }

    // 3. Vue Props (__vnode) & DOM Level 0
    const vnodeProps = (el as any).__vnode?.props;
    if (vnodeProps) {
      const vnodeFn = vnodeProps[`on${eventType.charAt(0).toUpperCase()}${eventType.slice(1)}`] || vnodeProps.onClick;
      if (typeof vnodeFn === 'function') {
        return {
          name: vnodeFn.name || 'anonymous',
          source: 'vue'
        };
      }
    }

    const domHandler = (el as any)[`on${eventType}`];
    if (typeof domHandler === 'function') {
      return {
        name: domHandler.name || 'anonymous',
        source: 'inline'
      };
    }

    // 4. MAIN-World Event Listener Registry (__wat_listeners__)
    const watListeners = (el as any).__wat_listeners__?.[eventType];
    if (Array.isArray(watListeners) && watListeners.length > 0) {
      return {
        name: watListeners[0],
        source: 'listener'
      };
    }
  }

  return undefined;
}
