import { useCallback, useRef, useState } from 'react';

/**
 * Tracks the width of a container element via ResizeObserver so layouts can
 * respond to the actual content width — not the raw viewport, which AntD's
 * `Col` xs/sm breakpoints follow. Use `isNarrow` to collapse form rows to a
 * single full-width column when the content area (e.g. behind a sidebar, or
 * inside a modal) is narrow, even on a wide window.
 *
 * Implemented as a CALLBACK ref (not a mount-time effect): AntD `Modal`
 * lazy-mounts its children on first open, so an effect-attached observer would
 * run while the node is still null and never observe anything. The callback
 * ref attaches/detaches the observer whenever the node actually (un)mounts.
 *
 * @param breakpoint Width (px) below which `isNarrow` is true (default 640).
 * @returns A callback ref to attach to the container and its measured width + narrow flag.
 */
export function useContainerWidth(breakpoint = 640): {
  ref: (node: HTMLDivElement | null) => void;
  width: number;
  isNarrow: boolean;
} {
  const [width, setWidth] = useState(0);
  const observerRef = useRef<ResizeObserver | null>(null);

  const ref = useCallback((node: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(node);
    observerRef.current = observer;
    setWidth(node.getBoundingClientRect().width);
  }, []);

  return { ref, width, isNarrow: width > 0 && width < breakpoint };
}
