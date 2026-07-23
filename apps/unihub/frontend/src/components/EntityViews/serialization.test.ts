/**
 * View URL serialization v2 — readable per-facet grammar (016 round 2).
 * Contract: specs/016-entity-views/contracts/view-url-serialization.md
 */
import { describe, expect, it } from 'vitest';
import type { ViewConfig } from '../EntityToolbar/types';
import {
  buildSearchString,
  columnsFromVisibleKeys,
  configsEqual,
  hasViewParams,
  normalizeConfig,
  parseViewParams,
  serializeInlineEntries,
  serializeSavedEntries,
  upgradeConfigShape,
} from './serialization';

const TK = 'inventory-catalog';

const DEFAULTS: ViewConfig = {
  filters: [],
  sort: [],
  columns: [
    { key: '__caret', visible: true, order: 0, pin: 'left' },
    { key: 'name', visible: true, order: 1 },
    { key: 'spec', visible: true, order: 2 },
    { key: 'attr:abc123', visible: false, order: 3 },
    { key: 'actions', visible: true, order: 4, pin: 'right' },
  ],
  pageSize: 50,
};

const CONFIG: ViewConfig = {
  filters: [
    {
      logic: 'or',
      conditions: [
        { attr: 'acquisition__obtained_at', op: 'gte', val: '2026-01-01' },
        { attr: 'acquisition__obtained_at', op: 'is_empty', val: '' },
      ],
    },
  ],
  sort: [{ field: 'acquisition__obtained_at', direction: 'desc', nulls: 'first' }],
  columns: [
    { key: '__caret', visible: true, order: 0, pin: 'left' },
    { key: 'name', visible: true, order: 1, pin: 'left' },
    { key: 'attr:abc123', visible: true, order: 2 },
    { key: 'actions', visible: true, order: 3, pin: 'right' },
    { key: 'spec', visible: false, order: 4 },
  ],
  pageSize: 100,
};

const paramsOf = (entries: [string, string][]) => new URLSearchParams(buildSearchString(entries));

describe('serializeInlineEntries', () => {
  it('emits NO entries for a config equal to the defaults (clean URLs)', () => {
    expect(serializeInlineEntries(TK, DEFAULTS, DEFAULTS)).toEqual([]);
  });

  it('emits one readable named param per differing facet', () => {
    const entries = serializeInlineEntries(TK, CONFIG, DEFAULTS);
    const names = entries.map(([k]) => k);
    expect(names).toEqual([`${TK}.f`, `${TK}.sort`, `${TK}.cols`, `${TK}.size`]);

    const byName = new Map(entries);
    expect(byName.get(`${TK}.f`)).toBe(
      'or(acquisition__obtained_at gte 2026-01-01; acquisition__obtained_at is_empty)',
    );
    expect(byName.get(`${TK}.sort`)).toBe('-acquisition__obtained_at__nullsfirst');
    expect(byName.get(`${TK}.cols`)).toBe('__caret~left,name~left,attr:abc123,actions~right');
    expect(byName.get(`${TK}.size`)).toBe('100');
  });

  it('emits one f param PER GROUP, in group order', () => {
    const config: ViewConfig = {
      ...DEFAULTS,
      filters: [
        { logic: 'and', conditions: [{ attr: 'name', op: 'contains', val: 'cup' }] },
        { logic: 'or', conditions: [{ attr: 'spec', op: 'is_empty', val: '' }] },
      ],
    };
    const entries = serializeInlineEntries(TK, config, DEFAULTS);
    expect(entries.map(([k]) => k)).toEqual([`${TK}.f`, `${TK}.f`]);
    expect(entries[0]![1]).toBe('and(name contains cup)');
    expect(entries[1]![1]).toBe('or(spec is_empty)');
  });

  it('appends the transport-only page param when given', () => {
    const entries = serializeInlineEntries(TK, DEFAULTS, DEFAULTS, 3);
    expect(entries).toEqual([[`${TK}.page`, '3']]);
  });
});

describe('serializeSavedEntries', () => {
  it('references the view BY NAME with no overrides', () => {
    expect(serializeSavedEntries(TK, 'YTD')).toEqual([[`${TK}.view`, 'YTD']]);
  });

  it('layers override facets after the name', () => {
    const entries = serializeSavedEntries(TK, 'YTD', { pageSize: 100 }, 2);
    expect(entries).toEqual([
      [`${TK}.view`, 'YTD'],
      [`${TK}.size`, '100'],
      [`${TK}.page`, '2'],
    ]);
  });

  it('serializes column overrides with per-column pin suffixes', () => {
    const entries = serializeSavedEntries(TK, 'My view', { columns: CONFIG.columns });
    const byName = new Map(entries);
    expect(byName.get(`${TK}.cols`)).toBe('__caret~left,name~left,attr:abc123,actions~right');
  });
});

describe('buildSearchString (minimal encoding)', () => {
  it('keeps parens, semicolons, colons, commas and tildes literal; encodes spaces as %20', () => {
    const s = buildSearchString(serializeInlineEntries(TK, CONFIG, DEFAULTS));
    expect(s).toContain('or(acquisition__obtained_at%20gte%202026-01-01;');
    expect(s).toContain(`${TK}.cols=__caret~left,name~left,attr:abc123,actions~right`);
    expect(s).not.toContain('%28');
    expect(s).not.toContain('%3B');
    expect(s).not.toContain('%2C');
    expect(s).not.toContain('%3A');
  });

  it('percent-encodes the reserved characters & = # + %', () => {
    const s = buildSearchString([[`${TK}.view`, 'A&B=C#D+E%F']]);
    expect(s).toBe(`${TK}.view=A%26B%3DC%23D%2BE%25F`);
    expect(new URLSearchParams(s).get(`${TK}.view`)).toBe('A&B=C#D+E%F');
  });
});

describe('parseViewParams', () => {
  it('reports present: false when the namespace has no view params', () => {
    const params = new URLSearchParams('other=1&another-table.view=X');
    expect(parseViewParams(params, TK)).toEqual({ ok: true, present: false });
    expect(hasViewParams(params, TK)).toBe(false);
  });

  it('parses a saved-by-name reference with overrides', () => {
    const params = paramsOf([
      [`${TK}.view`, 'YTD'],
      [`${TK}.size`, '100'],
    ]);
    const result = parseViewParams(params, TK);
    if (!result.ok || !result.present) throw new Error('expected present parse');
    expect(result.view.viewName).toBe('YTD');
    expect(result.view.config.pageSize).toBe(100);
  });

  it('parses every inline facet, both from minimal and fully-encoded forms', () => {
    const minimal = paramsOf(serializeInlineEntries(TK, CONFIG, DEFAULTS, 2));
    const full = new URLSearchParams();
    for (const [k, v] of serializeInlineEntries(TK, CONFIG, DEFAULTS, 2)) full.append(k, v);

    for (const params of [minimal, full]) {
      const result = parseViewParams(params, TK);
      if (!result.ok || !result.present) throw new Error('expected present parse');
      expect(result.view.viewName).toBeUndefined();
      expect(result.view.config.filters).toEqual(CONFIG.filters);
      expect(result.view.config.sort).toEqual(CONFIG.sort);
      expect(result.view.config.pageSize).toBe(100);
      expect(result.view.page).toBe(2);
      expect(result.view.visibleColumns).toEqual([
        { key: '__caret', visible: true, order: 0, pin: 'left' },
        { key: 'name', visible: true, order: 1, pin: 'left' },
        { key: 'attr:abc123', visible: true, order: 2, pin: undefined },
        { key: 'actions', visible: true, order: 3, pin: 'right' },
      ]);
    }
  });

  it('keeps repeated f params in document order', () => {
    const params = paramsOf([
      [`${TK}.f`, 'and(name contains cup)'],
      [`${TK}.f`, 'or(spec is_empty)'],
    ]);
    const result = parseViewParams(params, TK);
    if (!result.ok || !result.present) throw new Error('expected present parse');
    expect(result.view.config.filters).toEqual([
      { logic: 'and', conditions: [{ attr: 'name', op: 'contains', val: 'cup' }] },
      { logic: 'or', conditions: [{ attr: 'spec', op: 'is_empty', val: '' }] },
    ]);
  });

  it('round-trips values containing grammar characters (; parens %)', () => {
    const config: ViewConfig = {
      ...DEFAULTS,
      filters: [
        { logic: 'and', conditions: [{ attr: 'name', op: 'contains', val: 'a; (b) 100%' }] },
      ],
    };
    const params = paramsOf(serializeInlineEntries(TK, config, DEFAULTS));
    const result = parseViewParams(params, TK);
    if (!result.ok || !result.present) throw new Error('expected present parse');
    expect(result.view.config.filters).toEqual([
      { logic: 'and', conditions: [{ attr: 'name', op: 'contains', val: 'a; (b) 100%' }] },
    ]);
  });

  it('isolates namespaces — two tables on one URL parse independently', () => {
    const params = paramsOf([
      [`${TK}.view`, 'YTD'],
      ['finance-accounts.size', '25'],
    ]);
    const a = parseViewParams(params, TK);
    const b = parseViewParams(params, 'finance-accounts');
    if (!a.ok || !a.present || !b.ok || !b.present) throw new Error('expected present parses');
    expect(a.view.viewName).toBe('YTD');
    expect(a.view.config.pageSize).toBeUndefined();
    expect(b.view.viewName).toBeUndefined();
    expect(b.view.config.pageSize).toBe(25);
  });

  it.each([
    ['bad filter grammar', [`${TK}.f`, 'nonsense'] as [string, string]],
    ['bad group logic', [`${TK}.f`, 'xor(a eq 1)'] as [string, string]],
    ['non-numeric size', [`${TK}.size`, 'huge'] as [string, string]],
    ['zero size', [`${TK}.size`, '0'] as [string, string]],
    ['non-numeric page', [`${TK}.page`, 'first'] as [string, string]],
  ])('rejects %s as malformed (FR-008 fallback)', (_label, entry) => {
    const params = paramsOf([entry]);
    expect(parseViewParams(params, TK)).toEqual({ ok: false, reason: 'malformed' });
  });

  it('treats the legacy packed view[<tableKey>] param as absent (round-1 format dropped)', () => {
    const params = new URLSearchParams();
    params.set(`view[${TK}]`, 'type=inline&page_size=100');
    expect(parseViewParams(params, TK)).toEqual({ ok: true, present: false });
  });
});

describe('columnsFromVisibleKeys (v2 — pins ride along)', () => {
  it('rebuilds the full list: listed visible (with URL pins), rest hidden with default pins', () => {
    const listed = [
      { key: 'name', visible: true, order: 0, pin: 'left' as const },
      { key: 'stale', visible: true, order: 1 },
      { key: 'spec', visible: true, order: 2 },
    ];
    const rebuilt = columnsFromVisibleKeys(listed, DEFAULTS.columns);
    expect(rebuilt).toEqual([
      { key: 'name', visible: true, order: 0, pin: 'left' },
      { key: 'spec', visible: true, order: 1, pin: undefined },
      { key: '__caret', visible: false, order: 2, pin: 'left' },
      { key: 'attr:abc123', visible: false, order: 3, pin: undefined },
      { key: 'actions', visible: false, order: 4, pin: 'right' },
    ]);
  });
});

describe('upgradeConfigShape (v1 → v2)', () => {
  it('projects the sticky pair onto first/last visible column pins and drops the keys', () => {
    const v1 = {
      filters: [],
      sort: [],
      columns: [
        { key: 'hidden', visible: false, order: 0 },
        { key: 'a', visible: true, order: 1 },
        { key: 'b', visible: true, order: 2 },
      ],
      stickyLeft: true,
      stickyRight: true,
      pageSize: 25,
    };
    const out = upgradeConfigShape(v1) as ViewConfig;
    expect('stickyLeft' in out).toBe(false);
    expect(out.columns).toEqual([
      { key: 'hidden', visible: false, order: 0 },
      { key: 'a', visible: true, order: 1, pin: 'left' },
      { key: 'b', visible: true, order: 2, pin: 'right' },
    ]);
  });

  it('passes v2 and foreign shapes through unchanged', () => {
    expect(upgradeConfigShape(CONFIG)).toBe(CONFIG);
    const foreign = { anything: true };
    expect(upgradeConfigShape(foreign)).toBe(foreign);
  });
});

describe('normalizeConfig / configsEqual (v2)', () => {
  it('ignores column list ordering but respects per-column pins', () => {
    const reordered: ViewConfig = { ...CONFIG, columns: [...CONFIG.columns].reverse() };
    expect(configsEqual(CONFIG, reordered)).toBe(true);

    const unpinned: ViewConfig = {
      ...CONFIG,
      columns: CONFIG.columns.map((c) => (c.key === 'name' ? { ...c, pin: undefined } : c)),
    };
    expect(configsEqual(CONFIG, unpinned)).toBe(false);
  });

  it('drops empty condition groups', () => {
    const withEmpty: ViewConfig = {
      ...CONFIG,
      filters: [...CONFIG.filters, { logic: 'and', conditions: [] }],
    };
    expect(configsEqual(CONFIG, withEmpty)).toBe(true);
  });

  it('normalizes v1 shapes into v2 comparisons (stale sessionStorage tabs)', () => {
    const stripped = CONFIG.columns.map((c) => ({
      key: c.key,
      visible: c.visible,
      order: c.order,
    }));
    const v1 = {
      filters: CONFIG.filters,
      sort: CONFIG.sort,
      columns: stripped,
      stickyLeft: false,
      stickyRight: false,
      pageSize: CONFIG.pageSize,
    };
    const v2 = upgradeConfigShape(v1) as ViewConfig;
    expect(normalizeConfig(v2)).toBe(normalizeConfig({ ...CONFIG, columns: stripped }));
  });
});
