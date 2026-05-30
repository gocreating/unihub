import Decimal from 'decimal.js';
import type { Balance, ExchangeRate } from '@/services/unihub-backend/finance';

const fmt = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatAmount(value: string | number): string {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(n)) return value.toString();
  return fmt.format(n);
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  TWD: 'NT$',
  USD: '$',
  EUR: '€',
  JPY: '¥',
  GBP: '£',
  CNY: '¥',
  HKD: 'HK$',
  SGD: 'S$',
};

export function getCurrencySymbol(code: string): string {
  return CURRENCY_SYMBOLS[code] ?? code;
}

/**
 * Converts `amount` in `currency` to `baseCurrency` using the most recent
 * ExchangeRate record that is on or before `targetDate` (if provided).
 * Without `targetDate`, falls back to the globally most-recent rate.
 *
 * Rate semantics: 1 base_currency = rate quote_currency.
 * - Direct rate (base=currency, quote=baseCurrency): amount * rate
 * - Inverse rate (base=baseCurrency, quote=currency): amount / rate
 */
export function computeNetWorthInBase(
  amount: string,
  currency: string,
  baseCurrency: string,
  rates: ExchangeRate[],
  targetDate?: string,
): Decimal | null {
  if (currency === baseCurrency) return new Decimal(amount);

  // Restrict to rates on or before the target date so that historical
  // balance sheets use historical rates rather than future rates.
  const eligible = targetDate
    ? rates.filter((r) => r.date <= targetDate)
    : rates;

  const direct = eligible
    .filter((r) => r.base_currency === currency && r.quote_currency === baseCurrency)
    .sort((a, b) => b.date.localeCompare(a.date));
  if (direct.length > 0) {
    return new Decimal(amount).mul(direct[0]!.rate);
  }

  const inverse = eligible
    .filter((r) => r.base_currency === baseCurrency && r.quote_currency === currency)
    .sort((a, b) => b.date.localeCompare(a.date));
  if (inverse.length > 0) {
    return new Decimal(amount).div(inverse[0]!.rate);
  }

  return null;
}

export type GroupingDimension = 'type' | 'currency';

/** Toggle a dimension in/out of the selected list. Order is preserved; new items append to the end. */
export function toggleDimension(
  current: GroupingDimension[],
  dim: GroupingDimension,
): GroupingDimension[] {
  if (current.includes(dim)) return current.filter((d) => d !== dim);
  return [...current, dim];
}

/** Move `fromDim` to the position occupied by `toDim`, shifting others accordingly. */
export function reorderDimension(
  current: GroupingDimension[],
  fromDim: GroupingDimension,
  toDim: GroupingDimension,
): GroupingDimension[] {
  const fromIdx = current.indexOf(fromDim);
  const toIdx = current.indexOf(toDim);
  if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return current;
  const next = [...current];
  next.splice(fromIdx, 1);
  next.splice(toIdx, 0, fromDim);
  return next;
}

export interface AggTreeNode {
  key: string;
  label: string;
  amount: Decimal;
  rawAmount: Decimal;
  /** Net worth in base currency — undefined when no base currency selected; null when rate is missing */
  netWorthInBase?: Decimal | null;
  currency?: string;
  children?: AggTreeNode[];
  accountId?: string;
  accountName?: string;
  isLeaf: boolean;
}

function groupKey(balance: Balance, dim: GroupingDimension): string {
  if (dim === 'type') {
    return new Decimal(balance.amount).gte(0) ? 'asset' : 'debt';
  }
  return balance.currency;
}

function groupLabel(dim: GroupingDimension, key: string, labels: { asset: string; debt: string }): string {
  if (dim === 'type') {
    return key === 'asset' ? labels.asset : labels.debt;
  }
  return key;
}

function toLeafNode(
  balance: Balance,
  parentKey: string,
  computeNw?: (amount: string, currency: string) => Decimal | null,
): AggTreeNode {
  const raw = new Decimal(balance.amount);
  return {
    key: `${parentKey}/${balance.id}`,
    label: balance.account_name,
    amount: raw.abs(),
    rawAmount: raw,
    netWorthInBase: computeNw ? computeNw(balance.amount, balance.currency) : undefined,
    currency: balance.currency,
    accountId: balance.account_id,
    accountName: balance.account_name,
    isLeaf: true,
  };
}

/**
 * Wraps a tree in a root node that always shows total net worth,
 * regardless of whether any grouping dimensions are selected.
 * When `treeData` is empty (no dimensions), root is a leaf row showing total only.
 */
export function buildTreeWithRoot(
  treeData: AggTreeNode[],
  totalNwInBase: Decimal | null,
  rootLabel: string,
): AggTreeNode[] {
  return [
    {
      key: 'root',
      label: rootLabel,
      amount: new Decimal(0),
      rawAmount: new Decimal(0),
      netWorthInBase: totalNwInBase,
      children: treeData.length > 0 ? treeData : undefined,
      isLeaf: treeData.length === 0,
    },
  ];
}

export function buildAggTree(
  balances: Balance[],
  dimensions: GroupingDimension[],
  labels: { asset: string; debt: string },
  parentKey = '',
  computeNw?: (amount: string, currency: string) => Decimal | null,
): AggTreeNode[] {
  if (dimensions.length === 0) {
    return balances
      .map((b) => toLeafNode(b, parentKey, computeNw))
      .sort((a, b) => b.rawAmount.minus(a.rawAmount).toNumber());
  }

  const [dim, ...rest] = dimensions as [GroupingDimension, ...GroupingDimension[]];
  const grouped = new Map<string, Balance[]>();
  for (const b of balances) {
    const k = groupKey(b, dim);
    if (!grouped.has(k)) grouped.set(k, []);
    grouped.get(k)!.push(b);
  }

  const nodes: AggTreeNode[] = [];
  for (const [k, group] of grouped) {
    const nodeKey = parentKey ? `${parentKey}/${dim}:${k}` : `${dim}:${k}`;
    const children = buildAggTree(group, rest, labels, nodeKey, computeNw);
    const rawAmount = children.reduce((sum, c) => sum.plus(c.rawAmount), new Decimal(0));
    const netWorthInBase = computeNw
      ? children.reduce((sum, c) => (c.netWorthInBase ? sum.plus(c.netWorthInBase) : sum), new Decimal(0))
      : undefined;
    nodes.push({
      key: nodeKey,
      label: groupLabel(dim, k, labels),
      amount: rawAmount.abs(),
      rawAmount,
      netWorthInBase,
      // Currency-dimension nodes group a single currency: expose it so renders can prefix the symbol.
      currency: dim === 'currency' ? k : undefined,
      children,
      isLeaf: false,
    });
  }

  return nodes.sort((a, b) => b.rawAmount.minus(a.rawAmount).toNumber());
}
