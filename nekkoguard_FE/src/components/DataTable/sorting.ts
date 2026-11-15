/** Sorting rules of DataTable (pure functions, unit-tested). */

/** Raw value a column sorts by (never the formatted display string). */
export type SortValue = string | number | boolean | Date | null | undefined;

export type SortDirection = 'asc' | 'desc';

export interface SortState {
  /** Column key. */
  key: string;
  direction: SortDirection;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

const isEmpty = (value: SortValue) =>
  value === null || value === undefined || value === '' || (value instanceof Date && Number.isNaN(value.getTime()));

/** Compares two values ascending; empty values always go last (see `sortRows`). */
function compareValues(a: SortValue, b: SortValue): number {
  if (typeof a === 'string' && typeof b === 'string') return collator.compare(a, b);
  const toNumber = (v: SortValue) => (v instanceof Date ? v.getTime() : typeof v === 'boolean' ? Number(v) : Number(v));
  const x = toNumber(a);
  const y = toNumber(b);
  if (!Number.isNaN(x) && !Number.isNaN(y)) return x - y;
  return collator.compare(String(a), String(b));
}

/** Stable sort; empty values last in both directions. */
export function sortRows<T>(rows: readonly T[], value: (row: T) => SortValue, direction: SortDirection): T[] {
  const sign = direction === 'asc' ? 1 : -1;
  return [...rows].sort((ra, rb) => {
    const a = value(ra);
    const b = value(rb);
    const emptyA = isEmpty(a);
    const emptyB = isEmpty(b);
    if (emptyA || emptyB) return emptyA === emptyB ? 0 : emptyA ? 1 : -1;
    return sign * compareValues(a, b);
  });
}

/** First click ascending, then toggles; another column starts ascending again. */
export function nextSort(current: SortState | null | undefined, key: string): SortState {
  if (current?.key === key) return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  return { key, direction: 'asc' };
}
