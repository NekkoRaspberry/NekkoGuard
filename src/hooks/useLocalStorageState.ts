import { useCallback, useState } from 'react';

function readBoolean(key: string, fallback: boolean): boolean {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : raw === 'true';
  } catch {
    return fallback;
  }
}

/** Boolean UI preference persisted per browser (e.g. collapsed sidebar). Storage failures are ignored. */
export function useLocalStorageBoolean(key: string, fallback: boolean): [boolean, (next: boolean) => void] {
  const [value, setValue] = useState(() => readBoolean(key, fallback));

  const update = useCallback(
    (next: boolean) => {
      setValue(next);
      try {
        window.localStorage.setItem(key, String(next));
      } catch {
        // preference simply won't persist
      }
    },
    [key],
  );

  return [value, update];
}
