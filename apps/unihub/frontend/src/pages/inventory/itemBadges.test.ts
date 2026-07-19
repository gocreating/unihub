import { describe, expect, it } from 'vitest';
import { draftParameters } from './itemBadges';
import type { AttributeDefinition } from '@/services/unihub-backend/core';

// Value-only badge composition retired in iteration 26 (FR-031) — key-value
// pair formatting is covered by components/ItemDisplay tests.

describe('draftParameters (pending ItemWrite rows → displayable parameters)', () => {
  it('resolves names and types from the definitions list', () => {
    const defs = [
      { id: 'w1', name: 'weight', data_type: 'dimension', unit_family: 'weight' },
      { id: 'c1', name: 'capacity', data_type: 'number', unit_family: '' },
    ] as AttributeDefinition[];
    const rows = [
      { definition_id: 'w1', value: '1.5', unit: 'kg' },
      { definition_id: 'c1', value: '42' },
      { definition_id: 'missing', value: 'x' },
    ];
    expect(draftParameters(rows, defs)).toEqual([
      { name: 'weight', data_type: 'dimension', value: '1.5', unit: 'kg' },
      { name: 'capacity', data_type: 'number', value: '42', unit: '' },
    ]);
  });

  it('returns an empty list without rows or definitions', () => {
    expect(draftParameters(undefined, undefined)).toEqual([]);
    expect(draftParameters([{ definition_id: 'x', value: '1' }], [])).toEqual([]);
  });
});
