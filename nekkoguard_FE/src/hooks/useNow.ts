import { useEffect, useState } from 'react';

/** Current time, re-rendered every `intervalMs` — keeps relative timestamps ("2 min ago") fresh. */
export function useNow(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}
