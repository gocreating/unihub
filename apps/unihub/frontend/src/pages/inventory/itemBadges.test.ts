import { describe, expect, it } from 'vitest';
import { itemCardBadges, parameterBadges } from './itemBadges';

const FULL = {
  quantity: 2,
  sku_price: '59.9000',
  sku_price_currency: 'TWD',
  size: 'M',
  color: 'red',
  length: { value: '30', unit: 'cm' },
  width: { value: '20', unit: 'cm' },
  height: { value: '10', unit: 'cm' },
  weight: { value: '1.5500', unit: 'kg' },
  volume: { value: '1.2', unit: 'L' },
  spec: 'M4 14"',
};

describe('itemCardBadges (card precedent, unchanged behaviour)', () => {
  // IB-01: full attribute set, established order and formats
  it('renders every non-empty attribute in card order', () => {
    expect(itemCardBadges(FULL)).toEqual([
      '× 2',
      '59.9 TWD',
      'M',
      'red',
      'L 30cm',
      'W 20cm',
      'H 10cm',
      '1.5500 kg',
      '1.2 L',
      'M4 14"',
    ]);
  });

  // IB-02: quantity 1 and empty fields are omitted
  it('omits quantity 1 and empty attributes', () => {
    expect(itemCardBadges({ quantity: 1, name: 'X' } as never)).toEqual([]);
  });
});

describe('parameterBadges (Catalog "Parameters" derived column, FR-003a)', () => {
  // PB-01: exactly color, weight, length, width, height, volume, size — spec order
  it('collects only the seven parameter attributes in spec order', () => {
    expect(parameterBadges(FULL)).toEqual([
      'red',
      '1.55 kg',
      'L 30cm',
      'W 20cm',
      'H 10cm',
      '1.2 L',
      'M',
    ]);
  });

  // PB-02: quantity, sku_price, and spec are never parameters
  it('excludes quantity, sku_price, and spec', () => {
    const badges = parameterBadges(FULL);
    expect(badges).not.toContain('× 2');
    expect(badges).not.toContain('59.9 TWD');
    expect(badges).not.toContain('M4 14"');
  });

  // PB-03: empty item → no badges
  it('returns an empty list when no parameter attribute is set', () => {
    expect(parameterBadges({ quantity: 3, sku_price: '5', spec: 's' })).toEqual([]);
  });

  // PB-04: measurement values drop trailing zeros
  it('drops trailing zeros on measurement values', () => {
    expect(parameterBadges({ weight: { value: '2.0000', unit: 'g' } })).toEqual(['2 g']);
  });
});
