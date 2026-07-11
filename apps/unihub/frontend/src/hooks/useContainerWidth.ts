import { useEffect, useRef, useState } from 'react';

/**
 * Tracks the width of a container element via ResizeObserver so layouts can
 * respond to the actual content width — not the raw viewport, which AntD's
 * `Col` xs/sm breakpoints follow. Use `isNarrow` to collapse form rows to a
 * single full-width column when the content area (e.g. behind a sidebar) is
 * narrow, even on a wide window.
 *
 * @param breakpoint Width (px) below which `isNarrow` is true (default 640).
 * @returns A ref to attach to the container and its measured width + narrow flag.
 */
export function useContainerWidth(breakpoint = 640): {
  ref: React.RefObject<HTMLDivElement>;
  width: number;
  isNarrow: boolean;
} {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, []);

  return { ref, width, isNarrow: width > 0 && width < breakpoint };
}
