// 016 round 11 — the shared rule for columns a stored order doesn't mention.
import { describe, it, expect } from 'vitest';
import { mergeMissingByDeclaredOrder } from './columnOrder';

describe('mergeMissingByDeclaredOrder', () => {
  it('slots a missing column after its declared predecessor, not at the tail', () => {
    // The catalog shape: a config captured before the attr:* columns loaded.
    const listed = ['caret', 'item', 'deprecate_time', 'actions'];
    const declared = ['caret', 'item', 'deprecate_time', 'attr:a', 'attr:b', 'actions'];
    expect(mergeMissingByDeclaredOrder(listed, declared)).toEqual(declared);
  });

  it('keeps consecutive newcomers in their declared order relative to each other', () => {
    expect(mergeMissingByDeclaredOrder(['a', 'z'], ['a', 'm', 'n', 'o', 'z'])).toEqual([
      'a',
      'm',
      'n',
      'o',
      'z',
    ]);
  });

  it('puts a newcomer with no declared predecessor at the front', () => {
    expect(mergeMissingByDeclaredOrder(['b'], ['first', 'b'])).toEqual(['first', 'b']);
  });

  it('preserves a user-chosen order for the columns the config does list', () => {
    // The stored order reverses the declared one — that is the user's choice
    // and must survive; only the newcomer is placed by declaration.
    expect(mergeMissingByDeclaredOrder(['c', 'b', 'a'], ['a', 'b', 'c', 'd'])).toEqual([
      'c',
      'b',
      'a',
      'd',
    ]);
  });

  it('is a no-op when the config already lists every declared column', () => {
    expect(mergeMissingByDeclaredOrder(['b', 'a'], ['a', 'b'])).toEqual(['b', 'a']);
  });

  it('anchors on the nearest listed predecessor when earlier ones are absent', () => {
    // 'd' is declared after 'c'; 'c' is not listed, so 'd' follows 'b'.
    expect(mergeMissingByDeclaredOrder(['a', 'b'], ['a', 'b', 'c', 'd'])).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
  });
});
