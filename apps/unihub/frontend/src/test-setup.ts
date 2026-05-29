/// <reference types="vitest/globals" />
import '@testing-library/jest-dom';

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
