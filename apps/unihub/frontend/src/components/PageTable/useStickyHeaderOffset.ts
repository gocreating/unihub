import { type RefObject, useEffect, useState } from 'react';

/**
 * Measures the site header and toolbar heights inside a ProTable container
 * and returns both:
 *  - toolbarTop: where the toolbar should stick (= site header height)
 *  - offsetHeader: where the table header should stick (= site header + toolbar)
 */
export function useStickyHeaderOffset(
  containerRef: RefObject<HTMLDivElement | null>,
): { toolbarTop: number; offsetHeader: number } {
  const [toolbarTop, setToolbarTop] = useState(56);
  const [offsetHeader, setOffsetHeader] = useState(56);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const toolbar = container.querySelector<HTMLElement>('.ant-pro-table-list-toolbar');
    const siteHeader = document.querySelector<HTMLElement>('.ant-layout-header, header');

    const update = () => {
      const headerH = siteHeader?.offsetHeight ?? 56;
      setToolbarTop(headerH);
      setOffsetHeader(headerH + (toolbar?.offsetHeight ?? 0));
    };

    update();

    const observer = new ResizeObserver(update);
    if (toolbar) observer.observe(toolbar);
    if (siteHeader) observer.observe(siteHeader);

    return () => {
      observer.disconnect();
    };
  }, [containerRef]);

  return { toolbarTop, offsetHeader };
}
