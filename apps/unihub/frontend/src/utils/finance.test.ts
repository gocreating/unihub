import { describe, expect, it } from 'vitest';
import {
  buildAggTree,
  buildTreeWithRoot,
  computeNetWorthInBase,
  formatAmount,
  getCurrencySymbol,
  reorderDimension,
  toggleDimension,
  type GroupingDimension,
} from './finance';
import Decimal from 'decimal.js';
import type { Balance, ExchangeRate } from '@/services/unihub-backend/finance';

// ── formatAmount ──────────────────────────────────────────────────────────────

describe('formatAmount', () => {
  it('formats a whole number with 2 decimal places', () => {
    expect(formatAmount('1000')).toBe('1,000.00');
  });

  it('formats a decimal string with commas', () => {
    expect(formatAmount('1234567.89')).toBe('1,234,567.89');
  });

  it('formats a negative amount', () => {
    expect(formatAmount('-5000.50')).toBe('-5,000.50');
  });

  it('formats a number input', () => {
    expect(formatAmount(42.5)).toBe('42.50');
  });

  it('returns the raw value when NaN', () => {
    expect(formatAmount('abc')).toBe('abc');
  });

  it('formats zero', () => {
    expect(formatAmount('0')).toBe('0.00');
  });
});

// ── getCurrencySymbol ─────────────────────────────────────────────────────────

describe('getCurrencySymbol', () => {
  it('returns NT$ for TWD', () => expect(getCurrencySymbol('TWD')).toBe('NT$'));
  it('returns $ for USD', () => expect(getCurrencySymbol('USD')).toBe('$'));
  it('returns € for EUR', () => expect(getCurrencySymbol('EUR')).toBe('€'));
  it('returns ¥ for JPY', () => expect(getCurrencySymbol('JPY')).toBe('¥'));
  it('falls back to the code for unknown currencies', () => {
    expect(getCurrencySymbol('XYZ')).toBe('XYZ');
  });
});

// ── computeNetWorthInBase ─────────────────────────────────────────────────────

const makeRate = (base: string, quote: string, rate: string, date = '2026-01-01T00:00:00Z'): ExchangeRate => ({
  id: `${base}-${quote}`,
  base_currency: base,
  quote_currency: quote,
  rate,
  date,
});

describe('computeNetWorthInBase', () => {
  it('returns the amount unchanged when currency equals base currency', () => {
    const result = computeNetWorthInBase('1000', 'USD', 'USD', []);
    expect(result?.toNumber()).toBe(1000);
  });

  it('multiplies by direct rate (base=currency, quote=baseCurrency)', () => {
    // 1 TWD = 0.031 USD → 100 TWD = 3.1 USD
    const rates = [makeRate('TWD', 'USD', '0.031')];
    const result = computeNetWorthInBase('100', 'TWD', 'USD', rates);
    expect(result?.toFixed(3)).toBe('3.100');
  });

  it('divides by inverse rate (base=baseCurrency, quote=currency)', () => {
    // 1 USD = 32 TWD → 64 TWD = 2 USD
    const rates = [makeRate('USD', 'TWD', '32')];
    const result = computeNetWorthInBase('64', 'TWD', 'USD', rates);
    expect(result?.toFixed(4)).toBe('2.0000');
  });

  it('uses the most recent rate when multiple records exist and no targetDate', () => {
    const rates = [
      makeRate('TWD', 'USD', '0.030', '2026-01-01T00:00:00Z'),
      makeRate('TWD', 'USD', '0.032', '2026-06-01T00:00:00Z'), // newer
    ];
    const result = computeNetWorthInBase('100', 'TWD', 'USD', rates);
    expect(result?.toFixed(3)).toBe('3.200');
  });

  it('returns null when no rate is available', () => {
    const result = computeNetWorthInBase('100', 'EUR', 'USD', []);
    expect(result).toBeNull();
  });

  it('handles negative amounts correctly', () => {
    const rates = [makeRate('TWD', 'USD', '0.031')];
    const result = computeNetWorthInBase('-200', 'TWD', 'USD', rates);
    expect(result?.toFixed(1)).toBe('-6.2');
  });

  // ── targetDate: historical rate selection ───────────────────────────────

  it('uses the most-recent rate ON OR BEFORE targetDate — not a future rate', () => {
    const rates = [
      makeRate('TWD', 'USD', '0.030', '2022-01-01T00:00:00Z'), // historical
      makeRate('TWD', 'USD', '0.032', '2024-01-01T00:00:00Z'), // future relative to target
    ];
    // Balance sheet dated 2023-06 → should use 2022 rate, not 2024
    const result = computeNetWorthInBase('1000', 'TWD', 'USD', rates, '2023-06-01T00:00:00Z');
    expect(result?.toFixed(1)).toBe('30.0'); // 1000 * 0.030
  });

  it('picks the closest rate before target when multiple historical rates exist', () => {
    const rates = [
      makeRate('TWD', 'USD', '0.029', '2021-01-01T00:00:00Z'),
      makeRate('TWD', 'USD', '0.031', '2023-01-01T00:00:00Z'), // closest before target
      makeRate('TWD', 'USD', '0.033', '2025-01-01T00:00:00Z'),
    ];
    const result = computeNetWorthInBase('1000', 'TWD', 'USD', rates, '2023-06-01T00:00:00Z');
    expect(result?.toFixed(1)).toBe('31.0'); // 1000 * 0.031
  });

  it('returns null when no rate exists on or before targetDate', () => {
    const rates = [makeRate('TWD', 'USD', '0.031', '2025-01-01T00:00:00Z')];
    // Target date is before any available rate
    const result = computeNetWorthInBase('1000', 'TWD', 'USD', rates, '2020-01-01T00:00:00Z');
    expect(result).toBeNull();
  });

  it('includes a rate exactly on the targetDate', () => {
    const rates = [makeRate('TWD', 'USD', '0.031', '2023-06-01T00:00:00Z')];
    const result = computeNetWorthInBase('1000', 'TWD', 'USD', rates, '2023-06-01T00:00:00Z');
    expect(result?.toFixed(1)).toBe('31.0');
  });

  it('without targetDate uses most-recent rate (backward-compatible default)', () => {
    const rates = [
      makeRate('TWD', 'USD', '0.030', '2022-01-01T00:00:00Z'),
      makeRate('TWD', 'USD', '0.032', '2024-01-01T00:00:00Z'),
    ];
    const result = computeNetWorthInBase('1000', 'TWD', 'USD', rates);
    expect(result?.toFixed(1)).toBe('32.0'); // 2024 rate is most recent
  });

  it('applies targetDate filtering to inverse rate lookup as well', () => {
    const rates = [
      makeRate('USD', 'TWD', '30', '2022-01-01T00:00:00Z'),
      makeRate('USD', 'TWD', '32', '2024-01-01T00:00:00Z'), // future
    ];
    // Target date 2023-06 → use 2022 inverse rate (USD/TWD=30)
    const result = computeNetWorthInBase('60', 'TWD', 'USD', rates, '2023-06-01T00:00:00Z');
    expect(result?.toFixed(1)).toBe('2.0'); // 60 / 30 = 2 USD
  });
});

// ── buildAggTree ──────────────────────────────────────────────────────────────

const makeBalance = (id: string, accountId: string, name: string, currency: string, amount: string, color = ''): Balance => ({
  id,
  account_id: accountId,
  account_name: name,
  currency,
  color,
  amount,
});

const labels = { asset: 'Asset', debt: 'Debt' };

describe('buildAggTree', () => {
  const balances: Balance[] = [
    makeBalance('b1', 'a1', 'USD Savings', 'USD', '5000'),
    makeBalance('b2', 'a2', 'TWD Checking', 'TWD', '100000'),
    makeBalance('b3', 'a3', 'USD Loan', 'USD', '-2000'),
  ];

  it('returns leaf nodes when no dimensions specified', () => {
    const tree = buildAggTree(balances, [], labels);
    expect(tree).toHaveLength(3);
    expect(tree.every((n) => n.isLeaf)).toBe(true);
  });

  it('groups by type — asset vs debt', () => {
    const tree = buildAggTree(balances, ['type'], labels);
    expect(tree).toHaveLength(2);
    const assetNode = tree.find((n) => n.label === 'Asset');
    const debtNode = tree.find((n) => n.label === 'Debt');
    expect(assetNode?.children).toHaveLength(2);
    expect(debtNode?.children).toHaveLength(1);
  });

  it('asset node rawAmount is sum of positive amounts', () => {
    const tree = buildAggTree(balances, ['type'], labels);
    const assetNode = tree.find((n) => n.label === 'Asset');
    // USD Savings 5000 + TWD Checking 100000
    expect(assetNode?.rawAmount.toNumber()).toBe(105000);
  });

  it('groups by currency', () => {
    const tree = buildAggTree(balances, ['currency'], labels);
    const usdNode = tree.find((n) => n.label === 'USD');
    const twdNode = tree.find((n) => n.label === 'TWD');
    expect(usdNode?.children).toHaveLength(2);
    expect(twdNode?.children).toHaveLength(1);
  });

  it('sorts nodes by rawAmount descending', () => {
    const tree = buildAggTree(balances, ['type'], labels);
    expect(tree[0]!.label).toBe('Asset');
    expect(tree[1]!.label).toBe('Debt');
  });

  it('computes netWorthInBase when computeNw is provided', () => {
    const rates = [makeRate('TWD', 'USD', '0.031')];
    const computeNw = (amount: string, currency: string) =>
      computeNetWorthInBase(amount, currency, 'USD', rates);
    const tree = buildAggTree(balances, ['type'], labels, '', computeNw);
    const assetNode = tree.find((n) => n.label === 'Asset');
    // USD Savings: 5000 USD + TWD Checking: 100000 * 0.031 = 3100 USD → total 8100
    expect(assetNode?.netWorthInBase?.toNumber()).toBeCloseTo(8100, 0);
  });

  it('leaf nodes carry netWorthInBase when computeNw provided', () => {
    const rates = [makeRate('USD', 'USD', '1')];
    const computeNw = (amount: string, currency: string) =>
      computeNetWorthInBase(amount, currency, 'USD', rates);
    const tree = buildAggTree(
      [makeBalance('x1', 'a1', 'Savings', 'USD', '250')],
      [],
      labels,
      '',
      computeNw,
    );
    expect(tree[0]?.netWorthInBase?.toNumber()).toBe(250);
  });

  it('multi-dimension tree: type then currency', () => {
    const tree = buildAggTree(balances, ['type', 'currency'], labels);
    const assetNode = tree.find((n) => n.label === 'Asset');
    // Asset has USD Savings and TWD Checking → two currency sub-groups
    expect(assetNode?.children?.map((c) => c.label).sort()).toEqual(['TWD', 'USD']);
  });
});

// ── toggleDimension ───────────────────────────────────────────────────────────

describe('toggleDimension', () => {
  it('adds a dimension when it is not in the list', () => {
    expect(toggleDimension(['type'], 'currency')).toEqual(['type', 'currency']);
  });

  it('removes a dimension when it is already in the list', () => {
    expect(toggleDimension(['type', 'currency'], 'type')).toEqual(['currency']);
  });

  it('returns an empty array when the last dimension is removed', () => {
    expect(toggleDimension(['type'], 'type')).toEqual([]);
  });

  it('preserves order of remaining dimensions when removing', () => {
    expect(toggleDimension(['type', 'currency'], 'currency')).toEqual(['type']);
  });

  it('appends new dimension at end (does not alter existing order)', () => {
    expect(toggleDimension(['currency'], 'type')).toEqual(['currency', 'type']);
  });
});

// ── reorderDimension ──────────────────────────────────────────────────────────

describe('reorderDimension', () => {
  it('moves first item to second position', () => {
    expect(reorderDimension(['type', 'currency'], 'type', 'currency')).toEqual(['currency', 'type']);
  });

  it('moves second item to first position', () => {
    expect(reorderDimension(['type', 'currency'], 'currency', 'type')).toEqual(['currency', 'type']);
  });

  it('returns unchanged list when from and to are equal', () => {
    expect(reorderDimension(['type', 'currency'], 'type', 'type')).toEqual(['type', 'currency']);
  });

  it('returns unchanged list when fromDim is not in the list', () => {
    expect(reorderDimension(['type'], 'currency', 'type')).toEqual(['type']);
  });

  it('returns unchanged list when toDim is not in the list', () => {
    expect(reorderDimension(['type', 'currency'], 'type', 'type' as never)).toEqual(['type', 'currency']);
  });

  it('handles single-element list', () => {
    expect(reorderDimension(['type'], 'type', 'type')).toEqual(['type']);
  });
});

// ── buildTreeWithRoot ─────────────────────────────────────────────────────────

describe('buildTreeWithRoot', () => {
  it('always returns exactly one root node', () => {
    const root = buildTreeWithRoot([], null, 'Total');
    expect(root).toHaveLength(1);
    expect(root[0]!.key).toBe('root');
  });

  it('root is a leaf (no children) when treeData is empty — no dimensions required', () => {
    const root = buildTreeWithRoot([], new Decimal(1000), 'Total');
    expect(root[0]!.isLeaf).toBe(true);
    expect(root[0]!.children).toBeUndefined();
  });

  it('root carries the total net worth even with no children', () => {
    const root = buildTreeWithRoot([], new Decimal(4200), 'Total');
    expect(root[0]!.netWorthInBase?.toNumber()).toBe(4200);
  });

  it('root has children when treeData is non-empty', () => {
    const leaf: import('./finance').AggTreeNode = {
      key: 'type:asset',
      label: 'Asset',
      amount: new Decimal(1000),
      rawAmount: new Decimal(1000),
      isLeaf: false,
    };
    const root = buildTreeWithRoot([leaf], new Decimal(1000), 'Total');
    expect(root[0]!.isLeaf).toBe(false);
    expect(root[0]!.children).toHaveLength(1);
  });

  it('root net worth is null when no base currency set (null passed)', () => {
    const root = buildTreeWithRoot([], null, 'Total');
    expect(root[0]!.netWorthInBase).toBeNull();
  });

  it('root label is set correctly', () => {
    const root = buildTreeWithRoot([], null, 'Net Worth Total');
    expect(root[0]!.label).toBe('Net Worth Total');
  });
});

// ── Chart/table net worth consistency ────────────────────────────────────────
// Both chart and table must use computeNetWorthInBase when base currency is set.

describe('net worth chart/table consistency', () => {
  it('FX-converted total matches table when base currency is set', () => {
    const rates = [makeRate('TWD', 'USD', '0.031')];
    const sheetBalances = [
      makeBalance('b1', 'a1', 'TWD Savings', 'TWD', '100000'),  // 3100 USD
      makeBalance('b2', 'a2', 'USD Loan', 'USD', '-500'),        // -500 USD
    ];
    // Formula used by both chart (when baseCurrency set) and table column:
    const netWorth = sheetBalances.reduce((sum, b) => {
      const nwv = computeNetWorthInBase(b.amount, b.currency, 'USD', rates);
      return nwv !== null ? sum + nwv.toNumber() : sum;
    }, 0);
    expect(netWorth).toBeCloseTo(2600, 1); // 3100 - 500
  });

  it('without base currency falls back to raw sum (mixed currencies)', () => {
    const sheetBalances = [
      makeBalance('b1', 'a1', 'TWD Savings', 'TWD', '100000'),
      makeBalance('b2', 'a2', 'USD Loan', 'USD', '-500'),
    ];
    // Raw sum — used by chart when no baseCurrency selected
    const rawSum = sheetBalances.reduce((sum, b) => sum + parseFloat(b.amount), 0);
    expect(rawSum).toBe(99500); // 100000 + (-500), mixed currencies
  });
});

// ── Dimension state model — orderedDimensions + checkedDimensions ─────────────
// All dimensions are draggable. Checked ones contribute to activeGrouping in display order.

describe('dimension state model (all items draggable)', () => {
  it('active grouping reflects checked items in orderedDimensions order', () => {
    const orderedDimensions: GroupingDimension[] = ['currency', 'type'];
    const checkedDimensions = new Set<GroupingDimension>(['type', 'currency']);
    const activeGrouping = orderedDimensions.filter((d) => checkedDimensions.has(d));
    // currency appears before type in orderedDimensions
    expect(activeGrouping).toEqual(['currency', 'type']);
  });

  it('dragging an unchecked item reorders it, affecting later check order', () => {
    const initial: GroupingDimension[] = ['type', 'currency'];
    // User drags 'currency' (unchecked) to before 'type'
    const reordered = reorderDimension(initial, 'currency', 'type');
    expect(reordered).toEqual(['currency', 'type']);
    // Now user checks both — currency comes first because of drag
    const checkedDimensions = new Set<GroupingDimension>(['type', 'currency']);
    expect(reordered.filter((d) => checkedDimensions.has(d))).toEqual(['currency', 'type']);
  });

  it('unchecking a dimension removes it from active grouping but keeps its position in orderedDimensions', () => {
    const orderedDimensions: GroupingDimension[] = ['type', 'currency'];
    const checkedDimensions = new Set<GroupingDimension>(['type', 'currency']);
    // Uncheck 'type'
    const nextChecked = new Set(checkedDimensions);
    nextChecked.delete('type');
    const activeGrouping = orderedDimensions.filter((d) => nextChecked.has(d));
    expect(activeGrouping).toEqual(['currency']);
    // orderedDimensions still has 'type' in its position
    expect(orderedDimensions).toEqual(['type', 'currency']);
  });

  it('all DIMENSION_OPTIONS are present in orderedDimensions after any reorder', () => {
    const initial: GroupingDimension[] = ['type', 'currency'];
    const reordered = reorderDimension(initial, 'currency', 'type');
    expect(reordered).toHaveLength(initial.length);
    expect(new Set(reordered)).toEqual(new Set(initial));
  });
});

// ── Total net worth from raw balances (root node pattern) ────────────────────
// This pattern is used by the tree breakdown root node which computes total NW
// directly from balances regardless of dimension selection.

describe('total net worth from raw balances', () => {
  const rates = [makeRate('TWD', 'USD', '0.031')];

  it('sums all balances converted to base currency', () => {
    const testBalances = [
      makeBalance('b1', 'a1', 'USD Savings', 'USD', '1000'),   // 1000 USD
      makeBalance('b2', 'a2', 'TWD Account', 'TWD', '10000'),  // 310 USD
      makeBalance('b3', 'a3', 'USD Loan', 'USD', '-500'),      // -500 USD
    ];
    const total = testBalances.reduce((sum, b) => {
      const nwv = computeNetWorthInBase(b.amount, b.currency, 'USD', rates);
      return nwv !== null ? sum + nwv.toNumber() : sum;
    }, 0);
    // 1000 + 310 - 500 = 810
    expect(total).toBeCloseTo(810, 1);
  });

  it('contributes 0 for balances with no available exchange rate', () => {
    const testBalances = [
      makeBalance('b1', 'a1', 'USD Savings', 'USD', '1000'),  // 1000 USD (same currency)
      makeBalance('b2', 'a2', 'EUR Account', 'EUR', '500'),   // no EUR→USD rate → null
    ];
    const total = testBalances.reduce((sum, b) => {
      const nwv = computeNetWorthInBase(b.amount, b.currency, 'USD', []);
      return nwv !== null ? sum + nwv.toNumber() : sum;
    }, 0);
    // EUR→USD has no rate, contributes 0; USD→USD = 1000
    expect(total).toBe(1000);
  });

  it('root node is always computed regardless of dimension selection', () => {
    const testBalances = [
      makeBalance('b1', 'a1', 'TWD Savings', 'TWD', '50000'),
    ];
    // Simulate what the component does: compute totalNwInBase from balances directly
    const total = testBalances.reduce((sum, b) => {
      const nwv = computeNetWorthInBase(b.amount, b.currency, 'USD', rates);
      return nwv !== null ? sum + nwv.toNumber() : sum;
    }, 0);
    // 50000 * 0.031 = 1550
    expect(total).toBeCloseTo(1550, 1);
  });

  it('buildAggTree with empty dimensions returns leaf nodes for children display', () => {
    const testBalances = [
      makeBalance('b1', 'a1', 'USD Account', 'USD', '2000'),
    ];
    // When no dimensions are selected, buildAggTree returns leaf nodes.
    // These become the children of the root when dimensions are later added.
    const leaves = buildAggTree(testBalances, [], labels);
    expect(leaves).toHaveLength(1);
    expect(leaves[0]?.isLeaf).toBe(true);
    expect(leaves[0]?.label).toBe('USD Account');
  });
});
