// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataTable, type Column } from './DataTable';

afterEach(cleanup);

interface Row {
  id: number;
  name: string;
  count: number | null;
}

const ROWS: Row[] = [
  { id: 1, name: 'Bravo', count: 2 },
  { id: 2, name: 'alpha', count: null },
  { id: 3, name: 'Charlie', count: 10 },
];

const columns: Column<Row>[] = [
  { key: 'name', header: 'Name', render: (r) => r.name, sortValue: (r) => r.name },
  // Formatted display; sorting uses the raw number.
  { key: 'count', header: 'Count', render: (r) => (r.count === null ? '—' : `${r.count} items`), sortValue: (r) => r.count },
  { key: 'actions', header: 'Actions', render: () => 'edit' },
];

const firstColumn = () =>
  within(screen.getByRole('table'))
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0]?.textContent);

describe('DataTable sorting', () => {
  it('marks sortable columns and sorts on click: ascending, then descending', () => {
    render(<DataTable label="Things" columns={columns} rows={ROWS} rowKey={(r) => r.id} />);
    const nameHeader = screen.getByRole('columnheader', { name: /Name/ });
    expect(nameHeader.getAttribute('aria-sort')).toBe('none');
    expect(screen.getByRole('columnheader', { name: 'Actions' }).getAttribute('aria-sort')).toBeNull();
    expect(within(screen.getByRole('columnheader', { name: 'Actions' })).queryByRole('button')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Name/ }));
    expect(nameHeader.getAttribute('aria-sort')).toBe('ascending');
    expect(firstColumn()).toEqual(['alpha', 'Bravo', 'Charlie']);

    fireEvent.click(screen.getByRole('button', { name: /Name/ }));
    expect(nameHeader.getAttribute('aria-sort')).toBe('descending');
    expect(firstColumn()).toEqual(['Charlie', 'Bravo', 'alpha']);
  });

  it('sorts by the underlying value with empty values last', () => {
    render(<DataTable label="Things" columns={columns} rows={ROWS} rowKey={(r) => r.id} />);
    fireEvent.click(screen.getByRole('button', { name: /Count/ }));
    expect(firstColumn()).toEqual(['Bravo', 'Charlie', 'alpha']); // 2, 10, empty
    fireEvent.click(screen.getByRole('button', { name: /Count/ }));
    expect(firstColumn()).toEqual(['Charlie', 'Bravo', 'alpha']); // 10, 2, empty
  });

  it('server-side mode reports the sort and shows rows as received', () => {
    const onSortChange = vi.fn();
    const server: Column<Row>[] = [{ key: 'name', header: 'Name', render: (r) => r.name, sortField: 'name' }];
    render(
      <DataTable
        label="Things"
        columns={server}
        rows={ROWS}
        rowKey={(r) => r.id}
        sort={{ key: 'name', direction: 'desc' }}
        onSortChange={onSortChange}
      />,
    );
    expect(screen.getByRole('columnheader', { name: /Name/ }).getAttribute('aria-sort')).toBe('descending');
    fireEvent.click(screen.getByRole('button', { name: /Name/ }));
    expect(onSortChange).toHaveBeenCalledWith({ key: 'name', direction: 'asc' });
    expect(firstColumn()).toEqual(['Bravo', 'alpha', 'Charlie']);
  });
});
