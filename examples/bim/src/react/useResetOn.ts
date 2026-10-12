/**
 * State that starts again from `initial` whenever `key` changes, including a
 * change back to a key seen before.
 *
 * The reset happens during render and not in an effect, so the value for
 * the old key is never painted for the new one.
 */

import { useState } from 'react';

export function useResetOn<T>(
  key: unknown,
  initial: T,
): [T, (value: T) => void] {
  const [value, setValue] = useState(initial);
  const [seen, setSeen] = useState(key);
  if (seen !== key) {
    setSeen(key);
    setValue(initial);
  }
  return [value, setValue];
}

export default useResetOn;
