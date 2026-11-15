import { describe, expect, it } from 'vitest';
import { nextSort, sortRows, type SortValue } from './sorting';

const sorted = (values: SortValue[], direction: 'asc' | 'desc') => sortRows(values, (v) => v, direction);

describe('sortRows', () => {
  it('sorts text naturally and case-insensitively', () => {
    expect(sorted(['item 10', 'Item 2', 'item 1'], 'asc')).toEqual(['item 1', 'Item 2', 'item 10']);
  });

  it('sorts numbers, dates and booleans by value', () => {
    expect(sorted([10, 2, 33], 'asc')).toEqual([2, 10, 33]);
    const [a, b] = [new Date('2026-01-02'), new Date('2025-12-31')];
    expect(sorted([a, b], 'asc')).toEqual([b, a]);
    expect(sorted([true, false], 'asc')).toEqual([false, true]);
  });

  it('keeps empty values last in both directions', () => {
    expect(sorted(['b', null, 'a', '', undefined], 'asc')).toEqual(['a', 'b', null, '', undefined]);
    expect(sorted(['b', null, 'a'], 'desc')).toEqual(['b', 'a', null]);
  });

  it('is stable and does not mutate the input', () => {
    const rows = [
      { id: 1, v: 'x' },
      { id: 2, v: 'x' },
      { id: 3, v: 'a' },
    ];
    expect(sortRows(rows, (r) => r.v, 'asc').map((r) => r.id)).toEqual([3, 1, 2]);
    expect(rows.map((r) => r.id)).toEqual([1, 2, 3]);
  });
});

describe('nextSort', () => {
  it('starts ascending, then toggles; another column starts ascending again', () => {
    const first = nextSort(null, 'name');
    expect(first).toEqual({ key: 'name', direction: 'asc' });
    expect(nextSort(first, 'name')).toEqual({ key: 'name', direction: 'desc' });
    expect(nextSort({ key: 'name', direction: 'desc' }, 'name')).toEqual({ key: 'name', direction: 'asc' });
    expect(nextSort({ key: 'name', direction: 'desc' }, 'date')).toEqual({ key: 'date', direction: 'asc' });
  });
});
