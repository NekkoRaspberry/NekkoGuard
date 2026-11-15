// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appearanceApi, type AppearanceDto } from '@/api/appearance';
import { tenancyApi, type OrganizationDetailDto } from '@/api/tenancy';
import { OrganizationAppearancePage, TenantAppearancePage, TenantOrganizationAppearancePage } from './pages/AppearancePage';
import {
  appearanceDto,
  fakeTenancy,
  newQueryClient,
  organizationDto,
  ORG_ID,
  OTHER_ORG_ID,
  renderWith,
  TENANT_ID,
  tenancyFor,
  tenantDto,
} from './testing';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mockApi({
  tenant = appearanceDto(),
  organization = appearanceDto({ scope: 'organization' }),
}: { tenant?: AppearanceDto; organization?: AppearanceDto } = {}) {
  const get = vi.spyOn(appearanceApi, 'get').mockImplementation(async (_t, orgId) => (orgId ? organization : tenant));
  const update = vi.spyOn(appearanceApi, 'update').mockImplementation(async (_t, orgId) => (orgId ? organization : tenant));
  return { get, update };
}

/** Settings → Organization → Appearance of the selected organization. */
function setup(options: { tenant?: AppearanceDto; organization?: AppearanceDto } = {}) {
  const api = mockApi(options);
  const tenancy = tenancyFor({
    tenantPermissions: ['tenant.appearance.manage'],
    orgPermissions: ['organization.appearance.manage'],
  });
  const view = renderWith(<OrganizationAppearancePage />, { tenancy, client: newQueryClient() });
  return { ...view, ...api };
}

describe('Appearance follows the selected context', () => {
  it('Tenant → Appearance edits the selected tenant, without asking which one', async () => {
    const { get } = mockApi();
    renderWith(<TenantAppearancePage />, { tenancy: tenancyFor({ tenantPermissions: ['tenant.appearance.manage'] }) });
    await screen.findByLabelText('Application title');
    expect(get).toHaveBeenCalledWith(TENANT_ID, null, expect.anything());
    expect(screen.queryByLabelText('Customize')).toBeNull();
    expect(screen.queryByLabelText('Tenant')).toBeNull();
  });

  it('Organization → Appearance edits the selected organization, without asking which one', async () => {
    const { get } = setup();
    await screen.findByLabelText('Application title');
    expect(get).toHaveBeenCalledWith(TENANT_ID, ORG_ID, expect.anything());
    expect(get).not.toHaveBeenCalledWith(TENANT_ID, null, expect.anything());
    expect(screen.queryByLabelText('Customize')).toBeNull();
  });

  it('switching organization edits the new one and drops the unsaved draft', async () => {
    const { get, update, switchTo } = setup();
    const title = (await screen.findByLabelText('Application title')) as HTMLInputElement;
    fireEvent.change(title, { target: { value: 'Draft for HQ' } });
    switchTo(tenancyFor({ tenantPermissions: ['tenant.appearance.manage'], orgPermissions: [], orgId: OTHER_ORG_ID }));
    await waitFor(() => expect(get).toHaveBeenCalledWith(TENANT_ID, OTHER_ORG_ID, expect.anything()));
    expect(((await screen.findByLabelText('Application title')) as HTMLInputElement).value).toBe('');
    fireEvent.change(screen.getByLabelText('Application title'), { target: { value: 'Other' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(TENANT_ID, OTHER_ORG_ID, { title: 'Other' }));
    expect(update).not.toHaveBeenCalledWith(TENANT_ID, ORG_ID, expect.anything());
  });

  it('asks for an organization when none is selected', async () => {
    mockApi();
    renderWith(<OrganizationAppearancePage />, { tenancy: tenancyFor({ tenantPermissions: ['tenant.appearance.manage'] }) });
    expect(await screen.findByText('No organization selected')).toBeTruthy();
  });
});

describe('Tenant → Organizations → Appearance', () => {
  const OTHER_TENANT = '44444444-4444-4444-8444-444444444444';
  const pages = (
    <Routes>
      <Route path="/settings/tenant/organizations/manage/appearance" element={<TenantOrganizationAppearancePage />} />
      <Route path="/settings/tenant/organizations" element={<p>Organization list</p>} />
    </Routes>
  );

  // Opened via "Manage" (navigation state); a refresh reads it back from this tab.
  const openedInThisTab = () => window.sessionStorage.setItem('nekkoguard.managedOrganization', ORG_ID);
  afterEach(() => window.sessionStorage.clear());

  it('never puts the organization id in the URL', async () => {
    openedInThisTab();
    mockApi();
    vi.spyOn(tenancyApi, 'getOrganization').mockResolvedValue({ id: ORG_ID, name: 'Acme HQ' } as OrganizationDetailDto);
    renderWith(pages, {
      tenancy: tenancyFor({ tenantPermissions: ['tenant.appearance.manage'] }),
      route: '/settings/tenant/organizations/manage/appearance',
    });
    await screen.findByLabelText('Application title');
    const back = screen.getByRole('link', { name: 'Back to organization' });
    expect(back.getAttribute('href')).toBe('/settings/tenant/organizations/manage');
  });

  it('without a chosen organization, goes back to the organization list', async () => {
    mockApi();
    renderWith(pages, {
      tenancy: tenancyFor({ tenantPermissions: ['tenant.appearance.manage'] }),
      route: '/settings/tenant/organizations/manage/appearance',
    });
    expect(await screen.findByText('Organization list')).toBeTruthy();
  });

  it('edits the chosen organization of the selected tenant', async () => {
    openedInThisTab();
    const { get } = mockApi();
    vi.spyOn(tenancyApi, 'getOrganization').mockResolvedValue({ id: ORG_ID, name: 'Acme HQ' } as OrganizationDetailDto);
    renderWith(pages, {
      tenancy: tenancyFor({ tenantPermissions: ['tenant.appearance.manage'] }),
      route: '/settings/tenant/organizations/manage/appearance',
    });
    await screen.findByLabelText('Application title');
    expect(get).toHaveBeenCalledWith(TENANT_ID, ORG_ID, expect.anything());
    expect(await screen.findByText('Organization: Acme HQ')).toBeTruthy();
  });

  it('goes back to the organization list when the tenant changes', async () => {
    openedInThisTab();
    mockApi();
    vi.spyOn(tenancyApi, 'getOrganization').mockResolvedValue({ id: ORG_ID, name: 'Acme HQ' } as OrganizationDetailDto);
    const { switchTo } = renderWith(pages, {
      tenancy: tenancyFor({ tenantPermissions: ['tenant.appearance.manage'] }),
      route: '/settings/tenant/organizations/manage/appearance',
    });
    await screen.findByLabelText('Application title');
    const other = { ...tenantDto(['tenant.appearance.manage'], 'admin'), id: OTHER_TENANT, name: 'Globex' };
    switchTo(
      fakeTenancy({
        selection: { tenant: OTHER_TENANT, org: null, site: null, network: null },
        tenants: [other],
        currentTenant: other,
        currentOrganization: organizationDto([], OTHER_ORG_ID),
        tenantPermissions: new Set(other.permissions),
      }),
    );
    expect(await screen.findByText('Organization list')).toBeTruthy();
    expect(screen.queryByLabelText('Application title')).toBeNull();
  });
});

const preview = () => screen.getByTestId('appearance-preview');

describe('Appearance editor', () => {
  it('shows where each organization value comes from', async () => {
    setup({
      organization: appearanceDto({
        scope: 'organization',
        configured: { primary_color: '#aa0000' },
        inherited: { accent_color: '#00aa00', title: 'Acme Guard' },
      }),
    });
    const primary = await screen.findByLabelText('Primary');
    expect((primary as HTMLInputElement).value).toBe('#aa0000');
    expect(within(primary.closest('div')?.parentElement as HTMLElement).getByText(/Customized for this organization/)).toBeTruthy();
    expect((screen.getByLabelText('Accent') as HTMLInputElement).value).toBe('#00aa00');
    expect(screen.getAllByText('Inherited from Acme').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Using NekkoGuard default').length).toBeGreaterThan(0);
    expect((screen.getByLabelText('Application title') as HTMLInputElement).placeholder).toBe('Acme Guard');
  });

  it('the preview includes the second bar: organization switcher and profile', async () => {
    setup();
    await screen.findByLabelText('Application title');
    const bar = within(preview());
    expect(bar.getByText('Acme HQ')).toBeTruthy(); // the organization being customized
    expect(bar.getByText('Me')).toBeTruthy(); // the signed-in user's name
  });

  it('previews changes live without touching the rest of the app', async () => {
    setup();
    const primary = await screen.findByLabelText('Primary');
    // Unset = NekkoGuard default, set explicitly so the page's (current Organization's) theme never leaks in.
    expect(preview().style.getPropertyValue('--primary')).toBe('#7c6cf6');
    fireEvent.change(primary, { target: { value: '#123456' } });
    expect(preview().style.getPropertyValue('--primary')).toBe('#123456');
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe('');
    fireEvent.click(screen.getByRole('radio', { name: /Top/ }));
    expect(preview().getAttribute('data-nav-position')).toBe('top');
  });

  it('saves only the changed settings', async () => {
    const { update } = setup();
    fireEvent.change(await screen.findByLabelText('Application title'), { target: { value: 'HQ Guard' } });
    fireEvent.change(screen.getByLabelText('Accent'), { target: { value: '#abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(TENANT_ID, ORG_ID, { title: 'HQ Guard', accent_color: '#aabbcc' }));
  });

  it('cancel discards unsaved changes', async () => {
    setup();
    const title = (await screen.findByLabelText('Application title')) as HTMLInputElement;
    fireEvent.change(title, { target: { value: 'Draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(title.value).toBe('');
    expect((screen.getByRole('button', { name: 'Save changes' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('resetting one property makes it inherit again', async () => {
    const { update } = setup({
      organization: appearanceDto({ scope: 'organization', configured: { accent_color: '#aa0000' }, inherited: { accent_color: '#00aa00' } }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Reset Accent' }));
    expect((screen.getByLabelText('Accent') as HTMLInputElement).value).toBe('#00aa00');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(TENANT_ID, ORG_ID, { accent_color: null }));
  });

  it('flags invalid colors and low contrast', async () => {
    setup();
    fireEvent.change(await screen.findByLabelText('Primary'), { target: { value: 'not-a-color' } });
    expect(screen.getByText(/Use #rrggbb/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Main text'), { target: { value: '#0b0b12' } });
    expect(screen.getByText('Low contrast')).toBeTruthy();
  });

  it('rejects SVG logos before uploading', async () => {
    setup();
    const input = await screen.findByLabelText('Upload Logo');
    const svg = new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' });
    fireEvent.change(input, { target: { files: [svg] } });
    expect(screen.getByRole('alert').textContent).toMatch(/SVG is not supported/);
  });

  it('is read-only when the backend says the scope cannot be managed', async () => {
    setup({ organization: appearanceDto({ scope: 'organization', can_manage: false }) });
    expect(await screen.findByText(/can view this appearance but not change it/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
  });
});
