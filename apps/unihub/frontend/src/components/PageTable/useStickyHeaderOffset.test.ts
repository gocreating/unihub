import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStickyHeaderOffset } from './useStickyHeaderOffset';
import { ResizeObserverMock } from '@/test-setup';

function makeDiv(offsetHeight = 0): HTMLDivElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'offsetHeight', { get: () => offsetHeight, configurable: true });
  return el;
}

describe('useStickyHeaderOffset', () => {
  let containerRef: { current: HTMLDivElement | null };

  beforeEach(() => {
    containerRef = { current: null };
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  // H-01: initial state before any DOM is resolved
  it('returns defaults of 56 before effect runs', () => {
    const { result } = renderHook(() => useStickyHeaderOffset(containerRef));
    expect(result.current.toolbarTop).toBe(56);
    expect(result.current.offsetHeader).toBe(56);
  });

  // H-02: site header present, no toolbar
  it('toolbarTop and offsetHeader equal site header height when no toolbar', () => {
    const header = makeDiv(72);
    header.className = 'ant-layout-header';
    document.body.appendChild(header);

    const container = makeDiv();
    containerRef.current = container;

    const { result } = renderHook(() => useStickyHeaderOffset(containerRef));

    act(() => {});
    expect(result.current.toolbarTop).toBe(72);
    expect(result.current.offsetHeader).toBe(72);
  });

  // H-03: site header + toolbar present
  it('offsetHeader equals site header + toolbar height', () => {
    const header = makeDiv(72);
    header.className = 'ant-layout-header';
    document.body.appendChild(header);

    const container = document.createElement('div');
    const toolbar = makeDiv(48);
    toolbar.className = 'ant-pro-table-list-toolbar';
    container.appendChild(toolbar);
    containerRef.current = container;

    const { result } = renderHook(() => useStickyHeaderOffset(containerRef));

    act(() => {});
    expect(result.current.toolbarTop).toBe(72);
    expect(result.current.offsetHeader).toBe(120);
  });

  // H-04: no site header element in DOM — falls back to 56
  it('falls back to 56 when no site header element exists', () => {
    const container = makeDiv();
    containerRef.current = container;

    const { result } = renderHook(() => useStickyHeaderOffset(containerRef));

    act(() => {});
    expect(result.current.toolbarTop).toBe(56);
    expect(result.current.offsetHeader).toBe(56);
  });

  // H-05 + H-06: ResizeObserver triggers update; observer disconnected on unmount
  it('updates when ResizeObserver fires and disconnects on unmount', () => {
    const header = makeDiv(56);
    header.className = 'ant-layout-header';
    document.body.appendChild(header);

    const container = makeDiv();
    containerRef.current = container;

    const { result, unmount } = renderHook(() => useStickyHeaderOffset(containerRef));
    act(() => {});
    expect(result.current.toolbarTop).toBe(56);

    // Simulate header resize: update offsetHeight then fire the ResizeObserver
    Object.defineProperty(header, 'offsetHeight', { get: () => 80, configurable: true });
    const roInstance = ResizeObserverMock.instances[0];
    expect(roInstance).toBeDefined();

    if (roInstance) {
      act(() => {
        roInstance.trigger();
      });
      expect(result.current.toolbarTop).toBe(80);

      // Unmount — ResizeObserver disconnects, no further updates should occur
      unmount();
      expect(roInstance.targets).toHaveLength(0);
    }
  });
});
