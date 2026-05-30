/**
 * PageTable — unified table layout component for all unihub pages.
 * Adapted from ov-fleet's PageTable component (UmiJS imports removed).
 *
 * Provides consistent styling and sticky behavior:
 * - White card container with rounded corners
 * - Title row with optional action element (e.g. "Create" button)
 * - Optional sticky toolbar (when headerTitle/toolBarRender are provided)
 * - Sticky table header below site header
 * - Horizontally scrollable table body
 * - Sticky horizontal scrollbar above footer
 * - Sticky footer (custom or pagination) at viewport bottom
 */
import type { ProTableProps } from '@ant-design/pro-components';
import { ProTable } from '@ant-design/pro-components';
import { Flex, Typography } from 'antd';
import { createStyles } from 'antd-style';
import { type ReactNode, type RefObject, useEffect, useRef } from 'react';
import { useStickyHeaderOffset } from './useStickyHeaderOffset';
// eslint-disable-next-line react-refresh/only-export-components
export { widthForHeader, measureTextWidth, computeScrollX, twoLineCellStyle } from './utils';
// eslint-disable-next-line react-refresh/only-export-components
export { useActionsColWidth } from './useActionsColWidth';

const useStyles = createStyles(({ token }) => ({
  pageCard: {
    background: token.colorBgContainer,
    borderRadius: token.borderRadiusLG,
  },
  titleRow: {
    padding: '16px 24px',
  },
  tableWrapper: {
    padding: '0 24px 16px',
    '.ant-pro-card': {
      boxShadow: 'none',
    },
    '.ant-table-footer': {
      position: 'sticky',
      bottom: 0,
      backgroundColor: token.colorBgContainer,
      padding: `${token.paddingXS}px 16px`,
      borderTop: `1px solid ${token.colorBorderSecondary}`,
      borderRadius: 0,
      margin: 0,
      zIndex: 2,
    },
    '.ant-pagination': {
      position: 'sticky',
      bottom: 0,
      backgroundColor: token.colorBgContainer,
      padding: `${token.paddingXS}px 0`,
      borderTop: `1px solid ${token.colorBorderSecondary}`,
      zIndex: 5,
      margin: '0 !important',
    },
    '.ant-table-cell': {
      whiteSpace: 'nowrap',
    },
  },
  stickyToolbar: {
    '.ant-pro-table-list-toolbar': {
      position: 'sticky',
      top: 'var(--toolbar-top, 56px)',
      zIndex: 10,
      backgroundColor: token.colorBgContainer,
      borderBottom: `1px solid ${token.colorBorderSecondary}`,
    },
    '& .ant-pro-table-list-toolbar-container': {
      flexDirection: 'row !important' as never,
      flexWrap: 'nowrap !important' as never,
      gap: `${token.marginXS}px !important`,
      overflowX: 'auto',
    },
    '& .ant-pro-table-list-toolbar-left': {
      flex: 'none !important' as never,
      flexWrap: 'nowrap !important' as never,
      marginBlockEnd: '0 !important' as never,
      maxWidth: '100% !important' as never,
    },
    '& .ant-pro-table-list-toolbar-right': {
      flex: 'none !important' as never,
      flexWrap: 'nowrap !important' as never,
      flexShrink: '0 !important' as never,
      gap: `${token.marginXS}px !important`,
    },
    // JS-applied mobile class (ProTable adds this at width < 375px)
    '& .ant-pro-table-list-toolbar-container-mobile': {
      flexDirection: 'row !important' as never,
      flexWrap: 'nowrap !important' as never,
      gap: `${token.marginXS}px !important`,
      overflowX: 'auto',
    },
    '& .ant-pro-table-list-toolbar-right .ant-space': {
      gap: `${token.marginXS}px !important`,
      flexWrap: 'nowrap !important' as never,
    },
    // Collapse toolbar button labels to icon-only on narrower viewports
    [`@media (max-width: ${token.screenLG}px)`]: {
      '.ant-pro-table-list-toolbar button > .toolbar-label': {
        display: 'none',
      },
    },
  },
  noHorizontalPadding: {
    paddingLeft: 0,
    paddingRight: 0,
  },
  contentVisibility: {
    '.ant-table-tbody > tr': {
      contentVisibility: 'auto',
      containIntrinsicSize: 'auto 55px',
    },
  },
}));

function useStickyFix(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const style = document.createElement('style');
    style.setAttribute('data-sticky-fix', '');
    style.textContent = [
      'html[data-sticky-fix],html[data-sticky-fix] body,html[data-sticky-fix] #root{height:auto!important;min-height:100%!important}',
      'html[data-sticky-fix] .ant-table{overflow:visible!important}',
      'html[data-sticky-fix] .ant-table .ant-table-footer{z-index:2!important}',
    ].join('');
    document.documentElement.setAttribute('data-sticky-fix', '');
    document.head.appendChild(style);
    return () => {
      document.documentElement.removeAttribute('data-sticky-fix');
      style.remove();
    };
  }, [enabled]);
}

function useStickyHorizontalScrollbar(containerRef: RefObject<HTMLDivElement | null>, enabled = true): void {
  const scrollbarRef = useRef<HTMLDivElement | null>(null);
  const spacerRef = useRef<HTMLDivElement | null>(null);
  const syncingRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    if (!container) return;

    const rcScrollbar = container.querySelector<HTMLElement>('.ant-table-sticky-scroll');
    if (rcScrollbar) rcScrollbar.style.setProperty('display', 'none', 'important');

    const body = container.querySelector<HTMLElement>('.ant-table-body');
    if (!body) return;

    const bar = document.createElement('div');
    bar.dataset.customScrollbar = 'true';
    Object.assign(bar.style, {
      position: 'sticky',
      bottom: '0px',
      zIndex: '3',
      overflowX: 'auto',
      overflowY: 'hidden',
      height: '12px',
      marginTop: '-12px',
      background: 'transparent',
    });

    const spacer = document.createElement('div');
    spacer.style.height = '1px';
    bar.appendChild(spacer);
    scrollbarRef.current = bar;
    spacerRef.current = spacer;

    const antTable = container.querySelector('.ant-table');
    const footer = antTable?.querySelector<HTMLElement>('.ant-table-footer') ?? null;
    if (antTable) {
      if (footer) antTable.insertBefore(bar, footer);
      else antTable.appendChild(bar);
    }

    const update = () => {
      if (!body || !spacer || !bar) return;
      const hasOverflow = body.scrollWidth > body.clientWidth;
      spacer.style.width = `${body.scrollWidth}px`;
      bar.style.display = hasOverflow ? 'block' : 'none';
      const footerEl = container.querySelector<HTMLElement>('.ant-table-footer, .ant-pagination');
      bar.style.bottom = `${footerEl?.offsetHeight ?? 0}px`;
      const rcSb = container.querySelector<HTMLElement>('.ant-table-sticky-scroll');
      if (rcSb) rcSb.style.setProperty('display', 'none', 'important');
    };

    update();

    const onBarScroll = () => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      body.scrollLeft = bar.scrollLeft;
      syncingRef.current = false;
    };
    const onBodyScroll = () => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      bar.scrollLeft = body.scrollLeft;
      syncingRef.current = false;
    };

    bar.addEventListener('scroll', onBarScroll, { passive: true });
    body.addEventListener('scroll', onBodyScroll, { passive: true });

    const mo = new MutationObserver(() => requestAnimationFrame(update));
    mo.observe(container, { childList: true, subtree: true });
    const ro = new ResizeObserver(() => update());
    ro.observe(body);

    return () => {
      bar.removeEventListener('scroll', onBarScroll);
      body.removeEventListener('scroll', onBodyScroll);
      mo.disconnect();
      ro.disconnect();
      bar.remove();
      scrollbarRef.current = null;
      spacerRef.current = null;
    };
  }, [containerRef, enabled]);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface PageTableProps<T extends Record<string, any>>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extends Omit<ProTableProps<T, Record<string, any>>, 'search' | 'options' | 'className'> {
  pageTitle?: ReactNode;
  action?: ReactNode;
  contentVisibility?: boolean;
  /** Disable all sticky behaviour (fix, scrollbar, header). Use when PageTable is embedded inside a Card to prevent sticky elements from overlapping the Card header border. */
  noStickyFix?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PageTable<T extends Record<string, any>>({
  pageTitle,
  action,
  contentVisibility: enableContentVisibility = false,
  noStickyFix = false,
  pagination = false,
  ...proTableProps
}: PageTableProps<T>) {
  const { styles, cx } = useStyles();
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const hasToolbar = !!proTableProps.headerTitle || !!proTableProps.toolBarRender;
  const { toolbarTop, offsetHeader } = useStickyHeaderOffset(tableContainerRef);
  useStickyHorizontalScrollbar(tableContainerRef, !noStickyFix);
  useStickyFix(!noStickyFix);

  const className = cx(
    styles.tableWrapper,
    hasToolbar && styles.stickyToolbar,
    hasToolbar && styles.noHorizontalPadding,
    enableContentVisibility && styles.contentVisibility,
  );

  return (
    <div className={styles.pageCard}>
      {(pageTitle != null || action != null) && (
        <Flex justify="space-between" align="center" className={styles.titleRow}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {pageTitle}
          </Typography.Title>
          {action}
        </Flex>
      )}

      <div
        ref={tableContainerRef}
        className={className}
        style={{ '--toolbar-top': `${toolbarTop}px` } as React.CSSProperties}
      >
        <ProTable<T>
          search={false}
          options={false}
          pagination={pagination}
          sticky={noStickyFix ? false : { offsetHeader }}
          {...proTableProps}
        />
      </div>
    </div>
  );
}

export default PageTable;
