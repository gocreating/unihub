import { renderHook, act } from '@testing-library/react';
import { useDebouncedValue } from './useDebouncedValue';

describe('useDebouncedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebouncedValue('a', 300));
    expect(result.current).toBe('a');
  });

  it('updates only after the delay elapses', () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 300), {
      initialProps: { v: 'a' },
    });
    rerender({ v: 'ab' });
    expect(result.current).toBe('a');
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(result.current).toBe('a');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe('ab');
  });

  it('collapses rapid successive updates to the final value', () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 300), {
      initialProps: { v: '' },
    });
    for (const v of ['m', 'mu', 'muj', 'muji']) {
      rerender({ v });
      act(() => {
        vi.advanceTimersByTime(100);
      });
    }
    // No intermediate value ever surfaced; only the final one lands.
    expect(result.current).toBe('');
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current).toBe('muji');
  });

  it('clears the pending timer on unmount', () => {
    const { rerender, unmount } = renderHook(({ v }) => useDebouncedValue(v, 300), {
      initialProps: { v: 'a' },
    });
    rerender({ v: 'ab' });
    unmount();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    act(() => {
      vi.advanceTimersByTime(300);
    });
    // No setState-after-unmount warning fired.
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
