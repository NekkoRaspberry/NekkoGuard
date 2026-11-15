// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as xlsx from '@/lib/xlsx';
import { DataTable, type Column } from './DataTable';
import { TableExportButton } from './TableExport';
import { useTableExport } from './useTableExport';
import { exportFilename, tableToSheet } from './exportTable';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

interface Row {
  id: number;
  name: string;
  role: 'admin' | 'viewer';
  since: string;
}

const RANK = { admin: 0, viewer: 1 };
const LABEL = { admin: 'Administrator', viewer: 'Viewer' };
const ROWS: Row[] = [
  { id: 1, name: 'Zoe', role: 'viewer', since: '2026-01-02T00:00:00Z' },
  { id: 2, name: 'Adam', role: 'admin', since: '2026-01-01T00:00:00Z' },
];
const columns: Column<Row>[] = [
  { key: 'name', header: 'Name', render: (r) => r.name, sortValue: (r) => r.name },
  { key: 'role', header: 'Role', render: (r) => LABEL[r.role], sortValue: (r) => RANK[r.role], exportValue: (r) => LABEL[r.role] },
  { key: 'since', header: 'Since', render: (r) => r.since, exportValue: (r) => new Date(r.since) },
  { key: 'actions', header: <span>Actions</span>, render: () => 'edit' },
];

describe('tableToSheet', () => {
  it('exports readable values, skips action columns', () => {
    const sheet = tableToSheet('People', columns, ROWS);
    expect(sheet.headers).toEqual(['Name', 'Role', 'Since']);
    expect(sheet.rows[0]).toEqual(['Zoe', 'Viewer', new Date('2026-01-02T00:00:00Z')]);
  });

  it('file names are "<owner>-<table>-<date>", safe', () => {
    expect(exportFilename('Organizations', 'Acme MSP', new Date(2026, 10, 4))).toBe('Acme MSP-Organizations-2026-11-04.xlsx');
    expect(exportFilename('Sites/networks: all', 'Home: lab', new Date(2026, 10, 4))).toBe('Home lab-Sites networks all-2026-11-04.xlsx');
    expect(exportFilename('Sites', null, new Date(2026, 10, 4))).toBe('Sites-2026-11-04.xlsx');
  });
});

describe('DataTable export button', () => {
  it('exports the rows in the order shown', async () => {
    const download = vi.spyOn(xlsx, 'downloadFile').mockImplementation(() => undefined);
    const build = vi.spyOn(xlsx, 'buildXlsx');
    render(<DataTable label="People" columns={columns} rows={ROWS} rowKey={(r) => r.id} exportOwner="Acme" />);
    fireEvent.click(screen.getByRole('button', { name: /Role/ })); // sort by rank: administrator first
    fireEvent.click(screen.getByRole('button', { name: 'Export People to Excel' }));
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    expect(build.mock.calls[0]?.[0].rows.map((r) => r[0])).toEqual(['Adam', 'Zoe']);
    expect(download.mock.calls[0]?.[1]).toMatch(/^Acme-People-\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(download.mock.calls[0]?.[2]).toBe(xlsx.XLSX_MIME);
  });

  it('paginated tables export every row they are given', async () => {
    const download = vi.spyOn(xlsx, 'downloadFile').mockImplementation(() => undefined);
    const build = vi.spyOn(xlsx, 'buildXlsx');
    const all = [...ROWS, { id: 3, name: 'Page two', role: 'viewer' as const, since: '2026-01-03T00:00:00Z' }];
    render(<DataTable label="People" columns={columns} rows={ROWS} rowKey={(r) => r.id} exportRows={async () => all} />);
    fireEvent.click(screen.getByRole('button', { name: 'Export People to Excel' }));
    await waitFor(() => expect(download).toHaveBeenCalled());
    expect(build.mock.calls[0]?.[0].rows).toHaveLength(3);
  });

  it('shows an error when the export fails', async () => {
    render(
      <DataTable label="People" columns={columns} rows={ROWS} rowKey={(r) => r.id} exportRows={() => Promise.reject(new Error('x'))} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Export People to Excel' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/export failed/);
  });

  it('can show its button elsewhere (card header), exporting the rows shown', async () => {
    const download = vi.spyOn(xlsx, 'downloadFile').mockImplementation(() => undefined);
    const build = vi.spyOn(xlsx, 'buildXlsx');
    function Card({ rows }: { rows: Row[] }) {
      const exporter = useTableExport();
      return (
        <>
          <header data-testid="header">
            <TableExportButton exporter={exporter} />
          </header>
          <DataTable label="People" columns={columns} rows={rows} rowKey={(r) => r.id} exportOwner="Acme" exporter={exporter} />
        </>
      );
    }
    const { rerender } = render(<Card rows={ROWS} />);
    const button = await screen.findByRole('button', { name: 'Export People to Excel' });
    expect(screen.getByTestId('header').contains(button)).toBe(true);
    expect(screen.getAllByRole('button', { name: /Excel/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /Role/ }));
    fireEvent.click(button);
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    expect(build.mock.calls[0]?.[0].rows.map((r) => r[0])).toEqual(['Adam', 'Zoe']);
    rerender(<Card rows={[]} />);
    await waitFor(() => expect(screen.queryByRole('button', { name: /Excel/ })).toBeNull());
  });

  it('no button for empty tables or when disabled', () => {
    const { rerender } = render(<DataTable label="People" columns={columns} rows={[]} rowKey={(r) => r.id} empty="None" />);
    expect(screen.queryByRole('button', { name: /Excel/ })).toBeNull();
    rerender(<DataTable label="People" columns={columns} rows={ROWS} rowKey={(r) => r.id} exportable={false} />);
    expect(screen.queryByRole('button', { name: /Excel/ })).toBeNull();
  });
});
