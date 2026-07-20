// Contract tests for view URL serialization (specs/016-entity-views/contracts/view-url-serialization.md)
import { describe, expect, it } from 'vitest';
import type { ViewConfig } from '../EntityToolbar/types';
import {
  columnsFromVisibleKeys,
  configsEqual,
  normalizeConfig,
  parseViewParam,
  serializeInline,
  serializeSaved,
  viewParamName,
} from './serialization';

const DEFAULTS: ViewConfig = {
  filters: [],
  sort: [{ field: 'name', direction: 'asc' }],
  columns: [
    { key: 'name', visible: true, order: 0 },
    { key: 'spec', visible: true, order: 1 },
    { key: 'price', visible: false, order: 2 },
  ],
  stickyLeft: false,
  stickyRight: false,
  pageSize: 25,
};

const CUSTOM: ViewConfig = {
  filters: [
    {
      logic: 'and',
      conditions: [{ attr: 'obtained_at', op: 'gte', val: '2026-01-01' }],
    },
  ],
  sort: [{ field: 'acquisition__obtained_at', direction: 'desc', nulls: 'first' }],
  columns: [
    { key: 'spec', visible: true, order: 0 },
    { key: 'name', visible: true, order: 1 },
    { key: 'price', visible: false, order: 2 },
  ],
  stickyLeft: true,
  stickyRight: true,
  pageSize: 50,
};

describe('viewParamName', () => {
  it('namespaces per table', () => {
    expect(viewParamName('inventory-catalog')).toBe('view[inventory-catalog]');
  });
});

describe('serializeInline / parseViewParam round-trip', () => {
  it('round-trips a fully customised config on all visible facets', () => {
    const inner = serializeInline(CUSTOM, DEFAULTS);
    const parsed = parseViewParam(inner);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.view.type).toBe('inline');
    expect(parsed.view.config.filters).toEqual(CUSTOM.filters);
    expect(parsed.view.config.sort).toEqual(CUSTOM.sort);
    expect(parsed.view.config.stickyLeft).toBe(true);
    expect(parsed.view.config.stickyRight).toBe(true);
    expect(parsed.view.config.pageSize).toBe(50);
    const rebuilt = columnsFromVisibleKeys(parsed.view.visibleColumnKeys!, DEFAULTS.columns);
    expect(rebuilt).toEqual(CUSTOM.columns);
  });

  it('serializes a default-equal config to just type=inline (absent keys = defaults)', () => {
    const inner = serializeInline(DEFAULTS, DEFAULTS);
    expect(inner).toBe('type=inline');
    const parsed = parseViewParam(inner);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.view.config).toEqual({});
    expect(parsed.view.visibleColumnKeys).toBeUndefined();
  });

  it('transports the page position (1-based) without persisting it in config', () => {
    const inner = serializeInline(CUSTOM, DEFAULTS, 2);
    const parsed = parseViewParam(inner);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.view.page).toBe(2);
    expect('page' in parsed.view.config).toBe(false);
  });

  it('round-trips ordering with nulls suffixes', () => {
    const inner = serializeInline(
      { ...DEFAULTS, sort: [{ field: 'obtained_at', direction: 'desc', nulls: 'first' }] },
      DEFAULTS,
    );
    expect(inner).toContain('ordering=');
    expect(decodeURIComponent(inner)).toContain('-obtained_at__nullsfirst');
    const parsed = parseViewParam(inner);
    expect(parsed.ok && parsed.view.config.sort).toEqual([
      { field: 'obtained_at', direction: 'desc', nulls: 'first' },
    ]);
  });

  it('serializes each pin combination distinctly', () => {
    const left = serializeInline({ ...DEFAULTS, stickyLeft: true }, DEFAULTS);
    const right = serializeInline({ ...DEFAULTS, stickyRight: true }, DEFAULTS);
    const both = serializeInline({ ...DEFAULTS, stickyLeft: true, stickyRight: true }, DEFAULTS);
    for (const [inner, expectLeft, expectRight] of [
      [left, true, false],
      [right, false, true],
      [both, true, true],
    ] as const) {
      const parsed = parseViewParam(inner);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) continue;
      expect(parsed.view.config.stickyLeft ?? false).toBe(expectLeft);
      expect(parsed.view.config.stickyRight ?? false).toBe(expectRight);
    }
  });
});

describe('serializeSaved', () => {
  it('emits id plus only the overridden facets', () => {
    const inner = serializeSaved('Vx3kQ9aB2cD1', { pageSize: 100 });
    expect(inner).toBe('type=saved&id=Vx3kQ9aB2cD1&page_size=100');
  });

  it('parses the contract example: saved with a page_size override', () => {
    const parsed = parseViewParam('type=saved&id=Vx3kQ9aB2cD1&page_size=100');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.view.type).toBe('saved');
    expect(parsed.view.id).toBe('Vx3kQ9aB2cD1');
    expect(parsed.view.config.pageSize).toBe(100);
    expect(parsed.view.config.sort).toBeUndefined();
  });
});

describe('parseViewParam fallbacks (FR-008)', () => {
  it.each([
    ['unknown type', 'type=bogus'],
    ['saved without id', 'type=saved&page_size=50'],
    ['missing type', 'page_size=50'],
    ['bad filters JSON', 'type=inline&filters=notjson'],
    ['non-array filters JSON', 'type=inline&filters=%7B%7D'],
    ['non-numeric page_size', 'type=inline&page_size=abc'],
    ['non-numeric page', 'type=inline&page=xyz'],
    ['empty string', ''],
  ])('rejects %s', (_label, inner) => {
    const parsed = parseViewParam(inner);
    expect(parsed.ok).toBe(false);
  });

  it('ignores unknown inner keys (forward compatibility)', () => {
    const parsed = parseViewParam('type=inline&future_key=x&page_size=50');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.view.config.pageSize).toBe(50);
  });
});

describe('columnsFromVisibleKeys (FR-021 drift)', () => {
  it('drops unknown keys and appends unlisted defaults as hidden', () => {
    const rebuilt = columnsFromVisibleKeys(['spec', 'attr:deleted99', 'name'], DEFAULTS.columns);
    expect(rebuilt).toEqual([
      { key: 'spec', visible: true, order: 0 },
      { key: 'name', visible: true, order: 1 },
      { key: 'price', visible: false, order: 2 },
    ]);
  });
});

describe('normalizeConfig / configsEqual (dirty detection, R7)', () => {
  it('is insensitive to key order and empty condition groups', () => {
    const a: ViewConfig = { ...CUSTOM, filters: [...CUSTOM.filters, { logic: 'or', conditions: [] }] };
    expect(configsEqual(a, CUSTOM)).toBe(true);
    expect(normalizeConfig(a)).toBe(normalizeConfig(CUSTOM));
  });

  it('detects real differences', () => {
    expect(configsEqual({ ...CUSTOM, pageSize: 100 }, CUSTOM)).toBe(false);
    expect(configsEqual({ ...CUSTOM, stickyLeft: false }, CUSTOM)).toBe(false);
    expect(
      configsEqual({ ...CUSTOM, sort: [{ field: 'name', direction: 'asc' }] }, CUSTOM),
    ).toBe(false);
  });
});
