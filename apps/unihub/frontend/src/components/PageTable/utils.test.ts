import { describe, it, expect } from 'vitest';
import { widthForHeader, measureTextWidth, computeScrollX } from './utils';

describe('widthForHeader', () => {
  it('returns width based on text length plus padding', () => {
    const { width } = widthForHeader('Name');
    // "Name" is 4 chars → 4*8 + 44 = 76
    expect(width).toBe(76);
  });

  it('respects floor minimum', () => {
    const { width } = widthForHeader('Hi', 200);
    expect(width).toBe(200);
  });

  it('returns at least header padding for empty string', () => {
    const { width } = widthForHeader('');
    expect(width).toBe(44);
  });

  it('floor=0 does not suppress computed width', () => {
    // U-04: floor of 0 means no floor applied — computed value wins
    const { width } = widthForHeader('A', 0);
    expect(width).toBe(52); // 1*8 + 44
  });
});

describe('measureTextWidth', () => {
  it('returns 0 for null or undefined', () => {
    expect(measureTextWidth(null)).toBe(0);
    expect(measureTextWidth(undefined)).toBe(0);
    expect(measureTextWidth('')).toBe(0);
  });

  it('calculates width for text', () => {
    // "Hello" = 5 chars → 5*8 + 24 = 64
    expect(measureTextWidth('Hello')).toBe(64);
  });

  it('adds extra padding when specified', () => {
    expect(measureTextWidth('Hi', 10)).toBe(2 * 8 + 24 + 10);
  });

  it('treats CJK characters as double-width (14px each)', () => {
    // "國泰" = 2 CJK chars → 2*14 + 24 = 52
    expect(measureTextWidth('國泰')).toBe(52);
  });

  it('handles mixed CJK and ASCII correctly', () => {
    // "A國" = 8 + 14 + 24 = 46
    expect(measureTextWidth('A國')).toBe(46);
  });
});

describe('computeScrollX', () => {
  it('sums column widths', () => {
    const cols = [{ width: 100 }, { width: 200 }, { width: 150 }];
    expect(computeScrollX(cols)).toBe(450);
  });

  it('uses fallback for columns without width', () => {
    const cols = [{ width: 100 }, {}, { width: 50 }];
    expect(computeScrollX(cols, 80)).toBe(230);
  });

  it('returns 0 for empty columns', () => {
    expect(computeScrollX([])).toBe(0);
  });

  it('uses explicit width and ignores fallback when width is set (U-13)', () => {
    // U-13: single column with width=100 and custom fallback=50 → 100 (not 50)
    expect(computeScrollX([{ width: 100 }], 50)).toBe(100);
  });
});

