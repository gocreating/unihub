import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useRowLink } from './useRowLink';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

function setupHook() {
  const { result } = renderHook(() => useRowLink(), { wrapper });
  return result;
}

/** A synthetic-ish mouse event whose target is a real detached DOM node. */
function evt(
  target: HTMLElement,
  overrides: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; button: number }> = {},
) {
  return {
    target,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    button: 0,
    preventDefault: vi.fn(),
    ...overrides,
  } as unknown as React.MouseEvent<HTMLElement> & { preventDefault: ReturnType<typeof vi.fn> };
}

function cellIn(html: string): HTMLElement {
  const row = document.createElement('tr');
  row.innerHTML = html;
  document.body.appendChild(row);
  return row.querySelector('[data-probe]') as HTMLElement;
}

let openSpy: MockInstance<typeof window.open>;

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
  openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
  window.getSelection()?.removeAllRanges();
});

afterEach(() => {
  openSpy.mockRestore();
});

describe('useRowLink — navigation', () => {
  it('plain left click navigates in-SPA', () => {
    const props = setupHook().current('/finance/portfolios/p1');
    props.onClick?.(evt(cellIn('<td data-probe>cell</td>')));
    expect(mockNavigate).toHaveBeenCalledWith('/finance/portfolios/p1');
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('marks the row as clickable', () => {
    const props = setupHook().current('/finance/portfolios/p1');
    expect(props.style?.cursor).toBe('pointer');
  });

  it.each([
    ['ctrlKey', { ctrlKey: true }],
    ['metaKey', { metaKey: true }],
    ['shiftKey', { shiftKey: true }],
  ])('%s + click opens a new tab instead of navigating', (_label, mods) => {
    const props = setupHook().current('/finance/portfolios/p1');
    props.onClick?.(evt(cellIn('<td data-probe>cell</td>'), mods));
    expect(openSpy).toHaveBeenCalledWith('/finance/portfolios/p1', '_blank', 'noopener,noreferrer');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('middle click (auxclick button 1) opens a new tab and suppresses the default', () => {
    const props = setupHook().current('/finance/portfolios/p1');
    const e = evt(cellIn('<td data-probe>cell</td>'), { button: 1 });
    props.onAuxClick?.(e);
    expect(openSpy).toHaveBeenCalledWith('/finance/portfolios/p1', '_blank', 'noopener,noreferrer');
    expect(e.preventDefault).toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('right click (auxclick button 2) does nothing — the context menu must survive', () => {
    const props = setupHook().current('/finance/portfolios/p1');
    props.onAuxClick?.(evt(cellIn('<td data-probe>cell</td>'), { button: 2 }));
    expect(openSpy).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('returns no handlers at all when the row has no target url', () => {
    const props = setupHook().current(null);
    expect(props.onClick).toBeUndefined();
    expect(props.onAuxClick).toBeUndefined();
    expect(props.style).toBeUndefined();
  });
});

describe('useRowLink — guards (SC-008)', () => {
  it.each([
    ['an actions cell', '<td data-actions-col><button data-probe>Delete</button></td>'],
    ['a bare button', '<td><button data-probe>Close</button></td>'],
    ['an anchor', '<td><a href="/x" data-probe>Name</a></td>'],
    ['an input', '<td><input data-probe /></td>'],
    ['a checkbox', '<td><span class="ant-checkbox"><span data-probe>x</span></span></td>'],
    ['an opted-out control', '<td><span data-row-link-ignore><span data-probe>caret</span></span></td>'],
  ])('ignores clicks originating in %s', (_label, html) => {
    const props = setupHook().current('/finance/portfolios/p1');
    props.onClick?.(evt(cellIn(html)));
    props.onAuxClick?.(evt(cellIn(html), { button: 1 }));
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('ignores a click made while the user has text selected', () => {
    const cell = cellIn('<td data-probe>some selectable text</td>');
    const range = document.createRange();
    range.selectNodeContents(cell);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    expect(sel.toString().trim()).not.toBe('');

    const props = setupHook().current('/finance/portfolios/p1');
    props.onClick?.(evt(cell));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('still navigates once the selection is collapsed', () => {
    const cell = cellIn('<td data-probe>some selectable text</td>');
    window.getSelection()?.removeAllRanges();
    const props = setupHook().current('/finance/portfolios/p1');
    props.onClick?.(evt(cell));
    expect(mockNavigate).toHaveBeenCalledWith('/finance/portfolios/p1');
  });
});
