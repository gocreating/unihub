import Decimal from 'decimal.js';
import type { Balance } from '@/services/unihub-backend/finance';

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

export type GroupingDimension = 'type' | 'currency';

export interface AggTreeNode {
  key: string;
  label: string;
  amount: Decimal;
  rawAmount: Decimal;
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

function toLeafNode(balance: Balance, parentKey: string): AggTreeNode {
  const raw = new Decimal(balance.amount);
  return {
    key: `${parentKey}/${balance.id}`,
    label: balance.account_name,
    amount: raw.abs(),
    rawAmount: raw,
    currency: balance.currency,
    accountId: balance.account_id,
    accountName: balance.account_name,
    isLeaf: true,
  };
}

export function buildAggTree(
  balances: Balance[],
  dimensions: GroupingDimension[],
  labels: { asset: string; debt: string },
  parentKey = '',
): AggTreeNode[] {
  if (dimensions.length === 0) {
    return balances
      .map((b) => toLeafNode(b, parentKey))
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
    const children = buildAggTree(group, rest, labels, nodeKey);
    const rawAmount = children.reduce((sum, c) => sum.plus(c.rawAmount), new Decimal(0));
    nodes.push({
      key: nodeKey,
      label: groupLabel(dim, k, labels),
      amount: rawAmount.abs(),
      rawAmount,
      children,
      isLeaf: false,
    });
  }

  return nodes.sort((a, b) => b.rawAmount.minus(a.rawAmount).toNumber());
}
