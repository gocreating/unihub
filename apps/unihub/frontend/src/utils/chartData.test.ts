import { describe, expect, it } from 'vitest';
import { classifyAccountStacks, computeGreenRedSeries } from './chartData';

// ── computeGreenRedSeries ─────────────────────────────────────────────────────

describe('computeGreenRedSeries', () => {
  it('all positive → green has all values, red is all null', () => {
    const { greenVals, redVals } = computeGreenRedSeries([100, 200, 300]);
    expect(greenVals).toEqual([100, 200, 300]);
    expect(redVals.every((v) => v === null)).toBe(true);
  });

  it('all negative → red has all values, green is all null', () => {
    const { greenVals, redVals } = computeGreenRedSeries([-100, -200, -300]);
    expect(redVals).toEqual([-100, -200, -300]);
    expect(greenVals.every((v) => v === null)).toBe(true);
  });

  it('positive → negative transition shares 0 at boundary', () => {
    const { greenVals, redVals } = computeGreenRedSeries([100, -50]);
    // green: [100, 0] — 0 at i=1 because prev (100) is positive
    expect(greenVals).toEqual([100, 0]);
    // red: [0, -50] — 0 at i=0 because next (-50) is negative
    expect(redVals).toEqual([0, -50]);
  });

  it('negative → positive transition shares 0 at boundary', () => {
    const { greenVals, redVals } = computeGreenRedSeries([-100, 50]);
    expect(greenVals).toEqual([0, 50]);
    expect(redVals).toEqual([-100, 0]);
  });

  it('middle negative segment gets 0 on both adjacent positive sides', () => {
    const { greenVals, redVals } = computeGreenRedSeries([100, -50, 200]);
    // green: 100 at i=0, 0 at i=1 (boundary), 200 at i=2
    expect(greenVals).toEqual([100, 0, 200]);
    // red: 0 at i=0 (boundary), -50 at i=1, 0 at i=2 (boundary)
    expect(redVals).toEqual([0, -50, 0]);
  });

  it('middle positive segment gets 0 on both adjacent negative sides', () => {
    const { greenVals, redVals } = computeGreenRedSeries([-100, 50, -200]);
    expect(greenVals).toEqual([0, 50, 0]);
    expect(redVals).toEqual([-100, 0, -200]);
  });

  it('isolated negative surrounded by positives', () => {
    const { greenVals, redVals } = computeGreenRedSeries([1, -1, 1]);
    expect(greenVals).toEqual([1, 0, 1]);
    expect(redVals).toEqual([0, -1, 0]);
  });

  it('consecutive negative run: only boundaries get 0', () => {
    const { greenVals, redVals } = computeGreenRedSeries([10, -1, -2, -3, 5]);
    expect(greenVals).toEqual([10, 0, null, 0, 5]);
    expect(redVals).toEqual([0, -1, -2, -3, 0]);
  });

  it('zero is treated as positive (≥ 0)', () => {
    const { greenVals, redVals } = computeGreenRedSeries([0]);
    expect(greenVals).toEqual([0]);
    expect(redVals).toEqual([null]);
  });

  it('zero between negatives gets 0 on red boundary side', () => {
    const { greenVals, redVals } = computeGreenRedSeries([-10, 0, -20]);
    // 0 is ≥0, so it belongs to green; its neighbours are negative → red gets 0 on both sides
    expect(greenVals[1]).toBe(0);
    expect(redVals[0]).toBe(-10);
    expect(redVals[1]).toBe(0); // boundary: adjacent to negative values
    expect(redVals[2]).toBe(-20);
  });

  it('empty array returns two empty arrays', () => {
    const { greenVals, redVals } = computeGreenRedSeries([]);
    expect(greenVals).toEqual([]);
    expect(redVals).toEqual([]);
  });

  it('single positive value', () => {
    const { greenVals, redVals } = computeGreenRedSeries([500]);
    expect(greenVals).toEqual([500]);
    expect(redVals).toEqual([null]);
  });

  it('single negative value', () => {
    const { greenVals, redVals } = computeGreenRedSeries([-500]);
    expect(greenVals).toEqual([null]);
    expect(redVals).toEqual([-500]);
  });

  it('preserves array length in both outputs', () => {
    const input = [1, -2, 3, -4, 5];
    const { greenVals, redVals } = computeGreenRedSeries(input);
    expect(greenVals).toHaveLength(input.length);
    expect(redVals).toHaveLength(input.length);
  });
});

// ── classifyAccountStacks ─────────────────────────────────────────────────────

describe('classifyAccountStacks', () => {
  const data = [
    { accountName: 'Savings', amount: 5000 },
    { accountName: 'Savings', amount: 3000 },
    { accountName: 'Loan', amount: -10000 },
    { accountName: 'Loan', amount: -2000 },
    // Mixed: net positive
    { accountName: 'Mixed+', amount: 1000 },
    { accountName: 'Mixed+', amount: -500 },
    // Mixed: net negative
    { accountName: 'Mixed-', amount: 500 },
    { accountName: 'Mixed-', amount: -1500 },
  ];

  it('positive net total → assets', () => {
    const result = classifyAccountStacks(data, ['Savings']);
    expect(result.get('Savings')).toBe('assets');
  });

  it('negative net total → debts', () => {
    const result = classifyAccountStacks(data, ['Loan']);
    expect(result.get('Loan')).toBe('debts');
  });

  it('mixed positive net total → assets', () => {
    // Mixed+: 1000 + (-500) = 500 ≥ 0
    const result = classifyAccountStacks(data, ['Mixed+']);
    expect(result.get('Mixed+')).toBe('assets');
  });

  it('mixed negative net total → debts', () => {
    // Mixed-: 500 + (-1500) = -1000 < 0
    const result = classifyAccountStacks(data, ['Mixed-']);
    expect(result.get('Mixed-')).toBe('debts');
  });

  it('account with no data defaults to assets (total=0 ≥ 0)', () => {
    const result = classifyAccountStacks([], ['Unknown']);
    expect(result.get('Unknown')).toBe('assets');
  });

  it('account with exactly zero total → assets', () => {
    const zeroData = [
      { accountName: 'Zero', amount: 100 },
      { accountName: 'Zero', amount: -100 },
    ];
    const result = classifyAccountStacks(zeroData, ['Zero']);
    expect(result.get('Zero')).toBe('assets');
  });

  it('classifies all accounts in one pass', () => {
    const accounts = ['Savings', 'Loan', 'Mixed+', 'Mixed-'];
    const result = classifyAccountStacks(data, accounts);
    expect(result.size).toBe(4);
    expect(result.get('Savings')).toBe('assets');
    expect(result.get('Loan')).toBe('debts');
    expect(result.get('Mixed+')).toBe('assets');
    expect(result.get('Mixed-')).toBe('debts');
  });

  it('ignores data for accounts not in the accounts list', () => {
    const extraData = [...data, { accountName: 'NotInList', amount: 999 }];
    const result = classifyAccountStacks(extraData, ['Savings']);
    expect(result.has('NotInList')).toBe(false);
  });

  it('returns empty map for empty accounts list', () => {
    const result = classifyAccountStacks(data, []);
    expect(result.size).toBe(0);
  });
});
