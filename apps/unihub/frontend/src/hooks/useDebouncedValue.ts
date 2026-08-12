import { useEffect, useState } from 'react';

/**
 * useDebouncedValue — return a value that trails `value` by `delayMs`.
 *
 * The returned value updates only after the input has been stable for the
 * full delay, so rapid successive changes collapse to the final value.
 * Quick search (019) routes lookup params through this so a typing burst
 * issues one request, not one per keystroke (SC-003).
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
