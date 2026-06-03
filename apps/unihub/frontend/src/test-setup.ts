/// <reference types="vitest/globals" />
import '@testing-library/jest-dom';

// Suppress known AntD/React deprecation warnings that pollute test output.
// These come from @ant-design/pro-components internal Dropdown usage
// (dropdownRender is deprecated) and from echarts-for-react receiving a ref
// through a non-forwardRef component mock.
const _consoleError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  const msg = String(args[0] ?? '');
  if (
    msg.includes('Function components cannot be given refs') ||
    msg.includes('dropdownRender') ||
    msg.includes('[antd:') ||
    // ProLayout fires async internal state updates during mount; these are
    // harmless but React warns about missing act() wrapping.
    msg.includes('not wrapped in act(')
  ) return;
  _consoleError(...args);
};
const _consoleWarn = console.warn.bind(console);
console.warn = (...args: unknown[]) => {
  const msg = String(args[0] ?? '');
  if (msg.includes('[antd:')) return;
  _consoleWarn(...args);
};

// jsdom does not fully implement window.getComputedStyle — pseudo-element queries
// (e.g. ::-webkit-scrollbar used by rc-table to measure scrollbar width) trigger
// a noisy "Not implemented" warning to stderr on every test that renders a table.
// Return an empty style object for pseudo-element calls; forward real element calls.
const _realGetComputedStyle = window.getComputedStyle.bind(window);
Object.defineProperty(window, 'getComputedStyle', {
  writable: true,
  value: (elt: Element, pseudoElt?: string | null): CSSStyleDeclaration => {
    if (pseudoElt) {
      return new Proxy({} as CSSStyleDeclaration, { get: () => '' });
    }
    return _realGetComputedStyle(elt);
  },
});

// jsdom does not implement HTMLCanvasElement.getContext — used by PageTable's
// measureTextWidth() to measure column label widths via a 2D canvas context.
// Return null silently so canvasMeasure() falls through to its CJK-aware
// character-count fallback (8px Latin / 14px CJK), which is what the
// utils.test.ts expectations are written against.
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  writable: true,
  value: () => null,
});

// jsdom does not implement window.matchMedia — required by antd/ProTable
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// ResizeObserver is not implemented in jsdom. Provide a mock that:
//   - satisfies the ResizeObserver interface
//   - tracks all created instances in ResizeObserverMock.instances
//   - exposes trigger() so tests can simulate dimension changes
export class ResizeObserverMock {
  static instances: ResizeObserverMock[] = [];

  private callback: ResizeObserverCallback;
  readonly targets: Element[] = [];

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    ResizeObserverMock.instances.push(this);
  }

  observe(target: Element) {
    this.targets.push(target);
  }

  unobserve(target: Element) {
    const idx = this.targets.indexOf(target);
    if (idx !== -1) this.targets.splice(idx, 1);
  }

  disconnect() {
    this.targets.length = 0;
  }

  /** Simulate a resize event on all currently observed targets. */
  trigger() {
    const entries = this.targets.map(
      (target) =>
        ({
          target,
          contentRect: target.getBoundingClientRect(),
          borderBoxSize: [],
          contentBoxSize: [],
          devicePixelContentBoxSize: [],
        }) as ResizeObserverEntry,
    );
    this.callback(entries, this as unknown as ResizeObserver);
  }
}

// Reset instance list between tests
beforeEach(() => {
  ResizeObserverMock.instances = [];
});

global.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
