// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { termsApi, type TermsVersionsDto } from '@/api/terms';
import { fakeTenancy, renderWith, tenantDto } from '@/features/appearance/testing';
import { stubLayoutApis, versionDto } from './fixtures';
import { TermsPage } from './pages/TermsPage';

beforeAll(stubLayoutApis);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const tenancy = () => {
  const tenant = tenantDto(['tenant.view', 'tenant.manage'], 'admin');
  return fakeTenancy({ currentTenant: tenant, tenants: [tenant] });
};

const VERSIONS: TermsVersionsDto = {
  versions: [
    { ...versionDto(), number: 2 },
    { ...versionDto({ id: '22222222-2222-4222-8222-222222222222', number: 1, status: 'superseded', accepted_count: 5 }) },
  ],
  current_stats: { required: 4, accepted: 3, pending: 1 },
};

describe('Terms of Service page', () => {
  it('members read the current version and the history, nothing else', async () => {
    vi.spyOn(termsApi, 'tenantTerms').mockResolvedValue({ current: versionDto(), accepted_at: '2026-11-11T10:00:00Z', can_manage: false });
    const history = vi.spyOn(termsApi, 'history').mockResolvedValue(VERSIONS.versions);
    const adminVersions = vi.spyOn(termsApi, 'versions');
    renderWith(<TermsPage />, { tenancy: tenancy() });
    expect(await screen.findByRole('article', { name: 'Acme Terms' })).toBeTruthy();
    expect(screen.getByText(/You accepted this version on/)).toBeTruthy();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Current', 'History']);
    expect(screen.queryByRole('button', { name: /Publish|New version|Discard/ })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'History' }));
    const table = await screen.findByRole('table', { name: 'Terms of Service versions' });
    expect(within(table).getByText('Outdated')).toBeTruthy();
    expect(within(table).queryByRole('button', { name: 'Acceptances' })).toBeNull();
    expect(within(table).queryByText('Accepted by')).toBeNull();
    expect(history).toHaveBeenCalled();
    expect(adminVersions).not.toHaveBeenCalled();
  });

  it('explains when nothing is published', async () => {
    vi.spyOn(termsApi, 'tenantTerms').mockResolvedValue({ current: null, accepted_at: null, can_manage: false });
    renderWith(<TermsPage />, { tenancy: tenancy() });
    expect(await screen.findByText('No Terms of Service published for Acme')).toBeTruthy();
  });

  it('administrators see the document on Current (no statistics there) and the history', async () => {
    vi.spyOn(termsApi, 'tenantTerms').mockResolvedValue({ current: versionDto(), accepted_at: null, can_manage: true });
    vi.spyOn(termsApi, 'versions').mockResolvedValue(VERSIONS);
    renderWith(<TermsPage />, { tenancy: tenancy() });
    expect(await screen.findByRole('article', { name: 'Acme Terms' })).toBeTruthy();
    // The counts live on the Acceptance tab only.
    expect(screen.queryByRole('group', { name: 'Acceptance of the current version' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'History' }));
    const table = screen.getByRole('table', { name: 'Terms of Service versions' });
    expect(within(table).getByText('v1')).toBeTruthy();
    expect(within(table).getByText('Outdated')).toBeTruthy();
  });

  it('administrators start a draft, preview it and publish after confirming', async () => {
    vi.spyOn(termsApi, 'tenantTerms').mockResolvedValue({ current: versionDto(), accepted_at: null, can_manage: true });
    const draft = versionDto({ id: '33333333-3333-4333-8333-333333333333', number: null, status: 'draft', published_at: null, effective_date: null });
    const versions = vi.spyOn(termsApi, 'versions').mockResolvedValue(VERSIONS);
    const create = vi.spyOn(termsApi, 'createDraft').mockImplementation(async () => {
      versions.mockResolvedValue({ ...VERSIONS, versions: [draft, ...VERSIONS.versions] });
      return draft;
    });
    vi.spyOn(termsApi, 'version').mockResolvedValue(draft);
    const publish = vi.spyOn(termsApi, 'publish').mockResolvedValue({ ...draft, number: 3, status: 'current' });
    renderWith(<TermsPage />, { tenancy: tenancy() });

    fireEvent.click(await screen.findByRole('tab', { name: 'Draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'New version' }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole('tab', { name: /Preview/ }));
    expect(screen.getByText(/Preview — this is exactly what members will see/)).toBeTruthy();
    expect(screen.getByRole('link', { name: '2.Definitions' }).getAttribute('href')).toBe('#preview-definitions');

    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    const dialog = screen.getByRole('dialog', { name: 'Publish version 3 for Acme?' });
    expect(within(dialog).getByText(/must accept it before using NekkoGuard again/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Publish version 3' }));
    await waitFor(() => expect(publish).toHaveBeenCalledWith(expect.any(String), draft.id));
  });

  it('the acceptance table shows where each person stands', async () => {
    vi.spyOn(termsApi, 'tenantTerms').mockResolvedValue({ current: versionDto(), accepted_at: null, can_manage: true });
    vi.spyOn(termsApi, 'versions').mockResolvedValue(VERSIONS);
    const rows = vi.spyOn(termsApi, 'acceptances').mockResolvedValue({
      count: 2,
      next: null,
      previous: null,
      results: [
        { user: { id: 5, email: 'old@example.test', name: '' }, status: 'accepted_older', accepted_version: 1, accepted_at: '2026-10-01T00:00:00Z' },
        { user: { id: 6, email: 'new@example.test', name: '' }, status: 'never', accepted_version: null, accepted_at: null },
      ],
    });
    renderWith(<TermsPage />, { tenancy: tenancy() });
    fireEvent.click(await screen.findByRole('tab', { name: 'Acceptance' }));
    expect(await screen.findByText('Accepted older version')).toBeTruthy();
    expect(screen.getByText('Never accepted')).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: 'never' } });
    await waitFor(() => expect(rows).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ status: 'never', page: 1 }), expect.anything()));
  });

  it('History › Acceptances opens the Acceptance tab filtered on that version', async () => {
    vi.spyOn(termsApi, 'tenantTerms').mockResolvedValue({ current: versionDto(), accepted_at: null, can_manage: true });
    vi.spyOn(termsApi, 'versions').mockResolvedValue(VERSIONS);
    const rows = vi.spyOn(termsApi, 'acceptances').mockResolvedValue({ count: 0, next: null, previous: null, results: [] });
    renderWith(<TermsPage />, { tenancy: tenancy() });
    fireEvent.click(await screen.findByRole('tab', { name: 'History' }));
    const v1 = screen.getByText('v1').closest('tr') as HTMLElement;
    fireEvent.click(within(v1).getByRole('button', { name: 'Acceptances' }));
    expect(screen.getByRole('tab', { name: 'Acceptance' }).getAttribute('aria-selected')).toBe('true');
    expect((screen.getByRole('combobox', { name: 'Accepted version' }) as HTMLSelectElement).value).toBe('1');
    await waitFor(() => expect(rows).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ version: 1 }), expect.anything()));
  });

  it('the acceptance table is sorted by the server, column by column', async () => {
    vi.spyOn(termsApi, 'tenantTerms').mockResolvedValue({ current: versionDto(), accepted_at: null, can_manage: true });
    vi.spyOn(termsApi, 'versions').mockResolvedValue(VERSIONS);
    const rows = vi.spyOn(termsApi, 'acceptances').mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [{ user: { id: 5, email: 'a@example.test', name: '' }, status: 'never', accepted_version: null, accepted_at: null }],
    });
    renderWith(<TermsPage />, { tenancy: tenancy() });
    fireEvent.click(await screen.findByRole('tab', { name: 'Acceptance' }));
    await screen.findByRole('table', { name: 'Terms acceptance' });
    expect(rows).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ ordering: 'email' }), expect.anything());
    for (const [header, ordering] of [
      ['Status', 'status'],
      ['Last accepted', 'accepted_version'],
      ['Accepted at', 'accepted_at'],
    ] as const) {
      fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^${header}`) }));
      await waitFor(() => expect(rows).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ ordering }), expect.anything()));
    }
    fireEvent.click(await screen.findByRole('button', { name: /^Accepted at/ }));
    await waitFor(() => expect(rows).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ ordering: '-accepted_at' }), expect.anything()));
  });
});
