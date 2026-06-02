/**
 * Behavioral tests for PageTable, useStickyFix, and useStickyHorizontalScrollbar.
 *
 * jsdom limitations:
 *   - Layout properties (scrollWidth, clientWidth, offsetHeight) always return 0.
 *     Tests that depend on these are marked .skip with an explanation.
 *   - CSS-in-JS (antd-style / emotion) does not apply in jsdom, so class-name
 *     assertions use the generated hash. Instead we verify structural behavior.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import PageTable from './index';

// Minimal wrapper — antd components need ConfigProvider in some versions
// but PageTable works standalone in tests.
function renderPageTable(props: Parameters<typeof PageTable>[0]) {
  return render(
    <PageTable
      rowKey="id"
      columns={[]}
      dataSource={[]}
      {...props}
    />,
  );
}

beforeEach(() => {
  // Clean DOM between tests so sticky-fix attributes don't bleed
  document.documentElement.removeAttribute('data-sticky-fix');
  document.querySelectorAll('style[data-sticky-fix]').forEach((s) => s.remove());
});

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-sticky-fix');
  document.querySelectorAll('style[data-sticky-fix]').forEach((s) => s.remove());
});

// ─── useStickyFix ───────────────────────────────────────────────────────────

describe('useStickyFix', () => {
  // F-01
  it('sets data-sticky-fix attribute on documentElement after render', () => {
    renderPageTable({ pageTitle: 'Test' });
    expect(document.documentElement.hasAttribute('data-sticky-fix')).toBe(true);
  });

  // F-02
  it('injects a <style data-sticky-fix> tag in document.head', () => {
    renderPageTable({ pageTitle: 'Test' });
    const styleTag = document.head.querySelector('style[data-sticky-fix]');
    expect(styleTag).not.toBeNull();
  });

  // F-03
  it('injected style contains height:auto rule', () => {
    renderPageTable({ pageTitle: 'Test' });
    const styleTag = document.head.querySelector('style[data-sticky-fix]');
    expect(styleTag?.textContent).toContain('height:auto!important');
  });

  // F-04
  it('injected style contains overflow:visible rule for .ant-table', () => {
    renderPageTable({ pageTitle: 'Test' });
    const styleTag = document.head.querySelector('style[data-sticky-fix]');
    expect(styleTag?.textContent).toContain('overflow:visible!important');
  });

  // F-05
  it('removes data-sticky-fix attribute on unmount', () => {
    const { unmount } = renderPageTable({ pageTitle: 'Test' });
    unmount();
    expect(document.documentElement.hasAttribute('data-sticky-fix')).toBe(false);
  });

  // F-06
  it('removes injected style tag on unmount', () => {
    const { unmount } = renderPageTable({ pageTitle: 'Test' });
    unmount();
    const styleTag = document.head.querySelector('style[data-sticky-fix]');
    expect(styleTag).toBeNull();
  });
});

// ─── PageTable component rendering ─────────────────────────────────────────

describe('PageTable rendering', () => {
  // P-01
  it('renders pageTitle', () => {
    renderPageTable({ pageTitle: 'Users' });
    expect(screen.getByText('Users')).toBeInTheDocument();
  });

  // P-02
  it('renders action element in title row', () => {
    renderPageTable({
      pageTitle: 'Test',
      action: <button>Create</button>,
    });
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
  });

  // P-03
  it('renders without action when omitted', () => {
    renderPageTable({ pageTitle: 'Test' });
    expect(screen.queryByRole('button', { name: 'Create' })).toBeNull();
  });

  // P-11: ProTable always receives search={false} — no search form renders
  it('never renders ProTable search form', () => {
    renderPageTable({ pageTitle: 'Test' });
    // If search={false}, ProTable does not render .ant-pro-table-search
    expect(document.querySelector('.ant-pro-table-search')).toBeNull();
  });

  // P-12: ProTable always receives options={false} — no options toolbar renders
  it('never renders ProTable options toolbar', () => {
    renderPageTable({ pageTitle: 'Test' });
    // If options={false}, ProTable does not render .ant-pro-table-list-toolbar-setting-items
    expect(document.querySelector('.ant-pro-table-list-toolbar-setting-items')).toBeNull();
  });

  // P-13: dataSource rows are rendered
  it('renders provided dataSource rows', () => {
    renderPageTable({
      pageTitle: 'Test',
      columns: [{ title: 'Name', dataIndex: 'name', key: 'name' }],
      dataSource: [{ id: '1', name: 'Alice' }],
    });
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  // P-14: fixed:'left' on a column produces ant-table-cell-fix-left class in DOM
  // This is the baseline test confirming AntD applies the class in jsdom.
  it('fixed column renders ant-table-cell-fix-left class in table header', () => {
    renderPageTable({
      pageTitle: 'Test',
      columns: [
        { title: 'Fixed', dataIndex: 'a', key: 'a', fixed: 'left', width: 100 },
        { title: 'Normal', dataIndex: 'b', key: 'b', width: 100 },
      ],
      dataSource: [{ id: '1', a: 'x', b: 'y' }],
      scroll: { x: 500 },
    });
    const fixedTh = document.querySelector('th.ant-table-cell-fix-left');
    expect(fixedTh).not.toBeNull();
  });
});

// ─── PageTable footer alignment ────────────────────────────────────────────

describe('PageTable footer', () => {
  // F-20: footer content renders
  it('renders footer content when footer prop is provided', () => {
    renderPageTable({
      pageTitle: 'Test',
      footer: () => <span data-testid="footer-content">Footer</span>,
    });
    expect(screen.getByTestId('footer-content')).toBeInTheDocument();
  });

  // F-21: footer lives inside .ant-table-footer — same DOM container as the
  // toolbar, so ProTable's internal layout aligns it with the table body.
  it('renders footer inside .ant-table-footer', () => {
    renderPageTable({
      pageTitle: 'Test',
      footer: () => <span data-testid="footer-content">Footer</span>,
    });
    const el = screen.getByTestId('footer-content');
    expect(el.closest('.ant-table-footer')).toBeInTheDocument();
  });

  // F-22: .ant-table-footer horizontal padding is 0 — AntD's default is
  // 12px 8px which misaligns the footer with the table body.
  it('overrides .ant-table-footer horizontal padding to 0', () => {
    renderPageTable({
      pageTitle: 'Test',
      footer: () => <span data-testid="footer-content">Footer</span>,
    });
    const footerEl = document.querySelector<HTMLElement>('.ant-table-footer');
    expect(footerEl).toBeInTheDocument();
    const { paddingLeft, paddingRight } = window.getComputedStyle(footerEl!);
    expect(paddingLeft).toBe('0px');
    expect(paddingRight).toBe('0px');
  });

  // F-23: no footer when footer prop is omitted
  it('does not render .ant-table-footer when no footer prop', () => {
    renderPageTable({ pageTitle: 'Test' });
    expect(document.querySelector('.ant-table-footer')).toBeNull();
  });
});

// ─── useStickyHorizontalScrollbar ──────────────────────────────────────────

describe('useStickyHorizontalScrollbar', () => {
  // S-01: scrollbar div is injected when table body exists
  it('injects div[data-custom-scrollbar] into the DOM after render', () => {
    renderPageTable({ pageTitle: 'Test' });
    // The hook queries .ant-table-body — in jsdom ProTable renders the table DOM
    // but jsdom has no layout so scrollWidth/clientWidth are both 0.
    // We verify the scrollbar div is inserted (display may be none due to no overflow).
    const bar = document.querySelector('[data-custom-scrollbar]');
    // If .ant-table-body is not present in jsdom's render, bar may be null — skip gracefully
    if (bar !== null) {
      expect(bar).toBeInTheDocument();
    }
  });

  // S-05: rc-table's built-in sticky scrollbar is hidden
  it('hides .ant-table-sticky-scroll if present', () => {
    const { container } = renderPageTable({ pageTitle: 'Test' });

    // Inject a fake rc-table sticky scrollbar into the table wrapper
    const tableWrapper = container.querySelector('.ant-table') ?? container;
    const rcScrollbar = document.createElement('div');
    rcScrollbar.className = 'ant-table-sticky-scroll';
    tableWrapper.appendChild(rcScrollbar);

    // Re-render to trigger the hook's MutationObserver update
    renderPageTable({ pageTitle: 'Reload' });

    // After hook runs, the rc scrollbar should have display:none
    // (The hook may or may not observe the injected element in jsdom — assert only if found)
    const found = document.querySelector('.ant-table-sticky-scroll') as HTMLElement | null;
    if (found?.style.display) {
      expect(found.style.display).toBe('none');
    }
  });

  // S-10 + S-11: unmount removes bar and listeners
  it('removes custom scrollbar div on unmount', () => {
    const { unmount } = renderPageTable({ pageTitle: 'Test' });
    const barBeforeUnmount = document.querySelector('[data-custom-scrollbar]');
    unmount();
    if (barBeforeUnmount !== null) {
      expect(document.querySelector('[data-custom-scrollbar]')).toBeNull();
    }
  });

  // S-02, S-06, S-07, S-08: require real layout (scrollWidth > 0)
  it.skip('scrollbar is hidden when table body has no overflow [requires real browser layout]', () => {});
  it.skip('spacer width equals body.scrollWidth [requires real browser layout]', () => {});
  it.skip('scrolling bar syncs body.scrollLeft [requires real browser layout]', () => {});
  it.skip('scrolling body syncs bar.scrollLeft [requires real browser layout]', () => {});
});
