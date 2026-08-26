import { describe, it, expect } from 'vitest';
import { resolveAutoWidths } from './autoWidth';
import { measureTextWidth, widthForHeader } from './utils';

/**
 * Constitution v1.26.0 (Principle VII): PageTable owns column sizing. Pages
 * declare `autoWidth` and never loop their rows measuring text.
 */

interface Row {
  name: string;
  amount: string;
  note?: string | null;
}

const ROWS: Row[] = [
  { name: 'AAPL', amount: '10', note: 'short' },
  { name: 'a much longer instrument name', amount: '1234567.89', note: null },
  { name: 'BTC', amount: '5', note: 'x' },
];

const first = (cols: Parameters<typeof resolveAutoWidths<Row>>[0], rows: readonly Row[] = ROWS) =>
  resolveAutoWidths<Row>(cols, rows)[0]!;

describe('resolveAutoWidths', () => {
  it('sizes a column to the widest of its header and its values', () => {
    const col = first([{ dataIndex: 'name', autoWidth: { header: 'Name' } }]);
    const widest = measureTextWidth('a much longer instrument name');
    expect(col.width).toBe(Math.max(widthForHeader('Name').width, widest));
  });

  it('falls back to the header width when there are no rows', () => {
    const col = first([{ dataIndex: 'name', autoWidth: { header: 'Name' } }], []);
    expect(col.width).toBe(widthForHeader('Name').width);
  });

  it('uses `measure` in preference to the dataIndex value', () => {
    const col = first([
      { dataIndex: 'amount', autoWidth: { header: 'Amt', measure: (r) => `$ ${r.amount} USD` } },
    ]);
    expect(col.width).toBe(
      Math.max(widthForHeader('Amt').width, measureTextWidth('$ 1234567.89 USD')),
    );
  });

  it('clamps to `max` — a column narrower than its content stops at exactly max', () => {
    const col = first([{ dataIndex: 'name', autoWidth: { header: 'Name', max: 120 } }]);
    expect(col.width).toBe(120);
  });

  it('raises to `min` when header and content are both narrow', () => {
    const col = first([{ dataIndex: 'amount', autoWidth: { header: 'A', min: 300 } }]);
    expect(col.width).toBe(300);
  });

  it('ignores null/undefined cell values instead of measuring "null"', () => {
    const col = first([{ dataIndex: 'note', autoWidth: { header: 'Note' } }]);
    expect(col.width).toBe(Math.max(widthForHeader('Note').width, measureTextWidth('short')));
  });

  it('leaves columns with an explicit width untouched and strips the marker', () => {
    const cols = resolveAutoWidths<Row>(
      [
        { dataIndex: 'name', width: 42 },
        { dataIndex: 'amount', autoWidth: { header: 'Amt' } },
      ],
      ROWS,
    );
    expect(cols[0]!.width).toBe(42);
    expect(cols[1]!.width).toBeGreaterThan(0);
    // The autoWidth marker must not leak into the DOM as an unknown table prop.
    expect('autoWidth' in cols[1]!).toBe(false);
  });

  it('measures tree children too — a child\'s longer text must not be clipped', () => {
    const tree = [
      { name: 'parent', amount: '1', children: [{ name: 'a very long child row name', amount: '2' }] },
    ] as unknown as Row[];
    const col = resolveAutoWidths<Row>(
      [{ dataIndex: 'name', autoWidth: { header: 'Name' } }],
      tree,
    )[0]!;
    expect(col.width).toBe(
      Math.max(widthForHeader('Name').width, measureTextWidth('a very long child row name')),
    );
  });

  it('leaves columns with neither width nor autoWidth alone', () => {
    const col = first([{ dataIndex: 'name' }]);
    expect(col.width).toBeUndefined();
  });

  // FR-052 / I9-1: a column that declares its header text must never render a
  // blank header. The Portfolios list Position column shipped with
  // `autoWidth.header` and no `title` — the third blank-header defect.
  it('defaults `title` to `autoWidth.header` when the column declares no title', () => {
    const col = first([{ dataIndex: 'name', autoWidth: { header: 'Position' } }]);
    expect(col.title).toBe('Position');
  });

  it('leaves an explicit title (e.g. the sort-caret ReactNode) untouched', () => {
    const node = { type: 'span', props: { children: 'Name ▲' } };
    const col = first([{ dataIndex: 'name', title: node, autoWidth: { header: 'Name' } }]);
    expect(col.title).toBe(node);
  });
});
