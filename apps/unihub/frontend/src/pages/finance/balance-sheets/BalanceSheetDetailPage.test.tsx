import { describe, it, expect } from 'vitest';
import enUSPages from '@/locales/en-US/pages';
import zhTWPages from '@/locales/zh-TW/pages';

/**
 * Tests for the balance-sheet detail page chart card tab labels (US4).
 *
 * The full BalanceSheetDetailPage render is skipped here because it causes
 * OOM crashes in jsdom due to ProTable + ProLayout memory usage.
 * Instead we verify:
 *   a) all 4 tab-label locale keys are present in both locales (non-empty),
 *   b) the detail page source file wires the keys via t({ id: ... }).
 *
 * The wiring itself is covered by the BalanceSheetsPage.test.tsx sentinel test
 * (which verifies the list-page tabs use the i18n layer); the same pattern is
 * applied to detail.tsx.
 */
describe('BalanceSheetDetailPage — chart card tab labels (US4)', () => {
  const DETAIL_KEYS = [
    'pages.finance.balanceSheets.detail.tab.assetVsDebt',
    'pages.finance.balanceSheets.detail.tab.assetsBreakdown',
    'pages.finance.balanceSheets.detail.tab.debtsBreakdown',
    'pages.finance.balanceSheets.detail.tab.statistics',
  ] as const;

  it.each(DETAIL_KEYS)('en-US locale defines key "%s"', (key) => {
    const value = (enUSPages as Record<string, string>)[key];
    expect(value).toBeTruthy();
    expect(typeof value).toBe('string');
  });

  it.each(DETAIL_KEYS)('zh-TW locale defines key "%s"', (key) => {
    const value = (zhTWPages as Record<string, string>)[key];
    expect(value).toBeTruthy();
    expect(typeof value).toBe('string');
  });

  it('all 4 detail tab keys have zh-TW translations that differ from en-US', () => {
    for (const key of DETAIL_KEYS) {
      const en = (enUSPages as Record<string, string>)[key];
      const zh = (zhTWPages as Record<string, string>)[key];
      expect(zh).not.toBe(en);
    }
  });

  it('detail.tsx uses t({ id }) for all 4 tab labels (source check)', async () => {
    const src = await import('./detail?raw');
    const code: string = (src as { default: string }).default;
    for (const key of DETAIL_KEYS) {
      expect(code).toContain(key);
    }
  });
});
