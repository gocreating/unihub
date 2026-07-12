import { describe, expect, it } from 'vitest';
import {
  draftParameters,
  itemCardBadges,
  itemCoreBadges,
  parameterBadges,
} from './itemBadges';
import type { AttributeDefinition } from '@/services/unihub-backend/core';
import type { ItemParameter } from '@/services/unihub-backend/inventory';

const P = (over: Partial<ItemParameter>): ItemParameter => ({
  definition_id: 'd1',
  name: 'x',
  data_type: 'text',
  unit_family: '',
  value: '',
  unit: '',
  value_number: null,
  ...over,
});

const PARAMS: ItemParameter[] = [
  P({ name: 'color', value: 'red' }),
  P({ name: 'weight', data_type: 'dimension', unit_family: 'weight', value: '1.5500', unit: 'kg' }),
  P({ name: 'length', data_type: 'dimension', unit_family: 'length', value: '30', unit: 'cm' }),
  P({ name: 'width', data_type: 'dimension', unit_family: 'length', value: '20', unit: 'cm' }),
  P({ name: 'height', data_type: 'dimension', unit_family: 'length', value: '10', unit: 'cm' }),
  P({ name: 'volume', data_type: 'dimension', unit_family: 'volume', value: '1.2', unit: 'L' }),
  P({ name: 'size', value: 'M' }),
];

describe('parameterBadges (system-key compact formats, user keys labelled)', () => {
  // PB-01: the seven system keys keep their compact value formats
  it('formats system keys compactly, trailing zeros dropped', () => {
    expect(parameterBadges(PARAMS)).toEqual([
      'red',
      '1.55 kg',
      'L 30cm',
      'W 20cm',
      'H 10cm',
      '1.2 L',
      'M',
    ]);
  });

  // PB-02: user-defined keys render "key: value unit"
  it('labels user-defined keys', () => {
    expect(
      parameterBadges([
        P({ name: 'capacity', data_type: 'number', value: '5000.00' }),
        P({ name: 'material', data_type: 'text', value: 'nylon' }),
        P({ name: 'depth', data_type: 'dimension', unit_family: 'length', value: '5.50', unit: 'cm' }),
      ]),
    ).toEqual(['capacity: 5000', 'material: nylon', 'depth: 5.5 cm']);
  });

  // PB-03: empty list → no badges
  it('returns an empty list without parameters', () => {
    expect(parameterBadges([])).toEqual([]);
    expect(parameterBadges(undefined)).toEqual([]);
  });
});

describe('itemCoreBadges / itemCardBadges (acquisition card)', () => {
  const CORE = { quantity: 2, sku_price: '59.9000', sku_price_currency: 'TWD', spec: 'M4 14"' };

  // IB-01: core badges keep the established order/formats
  it('renders quantity (≠1), sku price, and spec', () => {
    expect(itemCoreBadges(CORE)).toEqual(['× 2', '59.9 TWD', 'M4 14"']);
    expect(itemCoreBadges({ quantity: 1 })).toEqual([]);
  });

  // IB-02: card badges = core + parameters
  it('composes core and parameter badges', () => {
    expect(itemCardBadges(CORE, PARAMS.slice(0, 2))).toEqual([
      '× 2',
      '59.9 TWD',
      'M4 14"',
      'red',
      '1.55 kg',
    ]);
  });
});

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
    const resolved = draftParameters(rows, defs);
    expect(parameterBadges(resolved)).toEqual(['1.5 kg', 'capacity: 42']);
  });
});
