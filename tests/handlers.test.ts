import { describe, it, expect, beforeEach } from 'vitest';
import { resolveElementHandler, sanitizeReactProps } from '../src/utils/handlers';

describe('Element Event Handler and React Props Extractor', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('extracts inline onclick attribute from element', () => {
    const btn = document.createElement('button');
    btn.setAttribute('onclick', 'doCheckout(123)');
    document.body.appendChild(btn);

    const handler = resolveElementHandler(btn, 'click');
    expect(handler).toBeDefined();
    expect(handler?.raw).toBe('doCheckout(123)');
    expect(handler?.name).toBe('doCheckout');
    expect(handler?.source).toBe('inline');
  });

  it('extracts handler from closest ancestor button when clicking inner span', () => {
    const btn = document.createElement('button');
    btn.setAttribute('onclick', 'submitOrder()');
    const span = document.createElement('span');
    span.textContent = 'Pay';
    btn.appendChild(span);
    document.body.appendChild(btn);

    const handler = resolveElementHandler(span, 'click');
    expect(handler).toBeDefined();
    expect(handler?.raw).toBe('submitOrder()');
    expect(handler?.name).toBe('submitOrder');
  });

  it('extracts React Component name, handler function, and sanitized props', () => {
    const btn = document.createElement('button');
    document.body.appendChild(btn);

    function onPayClick() {}

    (btn as any).__reactProps$test123 = {
      onClick: onPayClick,
      orderId: 'ORD-999',
      amount: 450,
      password: 'supersecretpassword',
      children: 'Pay',
      style: { color: 'red' }
    };

    (btn as any).__reactFiber$test123 = {
      return: {
        type: {
          name: 'OrderButton'
        }
      }
    };

    const handler = resolveElementHandler(btn, 'click');
    expect(handler).toBeDefined();
    expect(handler?.source).toBe('react');
    expect(handler?.name).toBe('onPayClick');
    expect(handler?.componentName).toBe('OrderButton');
    expect(handler?.props).toBeDefined();
    expect(handler?.props?.orderId).toBe('ORD-999');
    expect(handler?.props?.amount).toBe(450);
    expect(handler?.props?.password).toBe('[REDACTED]');
    expect(handler?.props?.children).toBeUndefined();
    expect(handler?.props?.style).toBeUndefined();
  });

  it('extracts framework attributes like @click, (click), and data-action', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <button id="btn-vue" v-on:click="openModal">Vue</button>
      <button id="btn-angular" ng-click="onSave()">Angular</button>
      <button id="btn-action" data-action="deleteItem">Action</button>
    `;
    document.body.appendChild(container);

    const btnVue = document.getElementById('btn-vue')!;
    const handlerVue = resolveElementHandler(btnVue, 'click');
    expect(handlerVue?.raw).toBe('openModal');
    expect(handlerVue?.source).toBe('attribute');

    const btnAngular = document.getElementById('btn-angular')!;
    const handlerAngular = resolveElementHandler(btnAngular, 'click');
    expect(handlerAngular?.raw).toBe('onSave()');

    const btnAction = document.getElementById('btn-action')!;
    const handlerAction = resolveElementHandler(btnAction, 'click');
    expect(handlerAction?.raw).toBe('deleteItem');
  });

  it('extracts main-world listener names from __wat_listeners__', () => {
    const btn = document.createElement('button');
    (btn as any).__wat_listeners__ = {
      click: ['handleCheckoutSubmit']
    };

    const handler = resolveElementHandler(btn, 'click');
    expect(handler).toBeDefined();
    expect(handler?.name).toBe('handleCheckoutSubmit');
    expect(handler?.source).toBe('listener');
  });

  it('returns undefined when no handler is found', () => {
    const div = document.createElement('div');
    div.textContent = 'Just plain text';
    const handler = resolveElementHandler(div, 'click');
    expect(handler).toBeUndefined();
  });

  it('sanitizes React props and caps at 5 items without throwing on circular structures', () => {
    const circular: any = { a: 1 };
    circular.self = circular;

    const props = {
      userToken: 'token_abc',
      age: 25,
      isActive: true,
      label: 'Submit',
      itemsCount: 10,
      extraProp1: 'extra',
      extraProp2: 'extra2',
      circularRef: circular
    };

    const sanitized = sanitizeReactProps(props);
    expect(sanitized.userToken).toBe('[REDACTED]');
    expect(sanitized.age).toBe(25);
    expect(sanitized.isActive).toBe(true);
    expect(Object.keys(sanitized).length).toBeLessThanOrEqual(5);
  });
});
