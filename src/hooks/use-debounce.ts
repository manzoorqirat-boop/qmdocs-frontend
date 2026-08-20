import { useState, useEffect } from 'react';

// Returns a debounced copy of `value` that only updates after `delay` ms
// have passed without a change. Use for search inputs so filtering doesn't
// fire on every keystroke — the raw value still drives the input so typing
// stays responsive; the debounced value drives the expensive filter/query.
export function useDebounce<T>(value: T, delay = 200): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  return debounced;
}
