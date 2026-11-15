// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MyOrganizationDto } from '@/api/tenancy';
import { fakeTenancy, renderWith, tenantDto } from '@/features/appearance/testing';
import { TopBar } from '@/layout/TopBar/TopBar';
import { ContextBar } from './components/ContextBar';
import { groupOrganizations } from './switcher';

afterEach(cleanup);

const T1 = '11111111-1111-4111-8111-111111111111';
const T2 = '22222222-2222-4222-8222-222222222222';
const org = (id: string, name: string, tenant: string, tenant_name: string): MyOrganizationDto => ({ id, name, tenant, tenant_name });
const ORGS = [
  org('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'X', T1, 'Tenant 1'),
  org('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'Y', T1, 'Tenant 1'),
  org('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'Z', T1, 'Tenant 1'),
  org('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', 'XYZ', T2, 'Tenant 2'),
  org('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5', 'AAA', T2, 'Tenant 2'),
];
const [X, , , XYZ] = ORGS as [MyOrganizationDto, MyOrganizationDto, MyOrganizationDto, MyOrganizationDto, MyOrganizationDto];

describe('groupOrganizations', () => {
  it('groups organizations under their tenant', () => {
    expect(groupOrganizations(ORGS).map((g) => [g.tenantName, g.organizations.map((o) => o.name)])).toEqual([
      ['Tenant 1', ['X', 'Y', 'Z']],
      ['Tenant 2', ['XYZ', 'AAA']],
    ]);
  });

  it('searches organization names, case-insensitively', () => {
    expect(groupOrganizations(ORGS, 'xy').map((g) => g.organizations.map((o) => o.name))).toEqual([['XYZ']]);
  });

  it('searching a tenant name lists all its organizations', () => {
    expect(groupOrganizations(ORGS, 'tenant 2').flatMap((g) => g.organizations.map((o) => o.name))).toEqual(['XYZ', 'AAA']);
  });

  it('no match → no groups', () => {
    expect(groupOrganizations(ORGS, 'nothing')).toEqual([]);
  });
});

function renderSwitcher(selectOrganization = vi.fn()) {
  const tenancy = fakeTenancy({
    tenants: [tenantDto()],
    myOrganizations: ORGS,
    selection: { tenant: T1, org: X.id, site: null, network: null },
    selectOrganization,
  });
  renderWith(<ContextBar />, { tenancy });
  return selectOrganization;
}

const openMenu = () => {
  const trigger = screen.getByRole('button', { name: 'Organization: X' });
  fireEvent.pointerDown(trigger, { button: 0, pointerType: 'mouse' });
  return screen.getByRole('menu');
};

describe('organization switcher', () => {
  it('shows only the current organization name (no "Organization" label)', () => {
    renderSwitcher();
    const trigger = screen.getByRole('button', { name: 'Organization: X' });
    expect(trigger.textContent).toBe('X');
  });

  it('lists organizations grouped by tenant, with search on the first row', () => {
    renderSwitcher();
    const menu = openMenu();
    const search = within(menu).getByRole('searchbox', { name: 'Search organizations' });
    expect(menu.firstElementChild?.contains(search)).toBe(true);
    expect(within(menu).getByText('Tenant 1')).toBeTruthy();
    expect(within(menu).getByText('Tenant 2')).toBeTruthy();
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['X', 'Y', 'Z', 'XYZ', 'AAA']);
  });

  it('filters while typing', () => {
    renderSwitcher();
    const menu = openMenu();
    fireEvent.change(within(menu).getByRole('searchbox'), { target: { value: 'aa' } });
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['AAA']);
    expect(within(menu).queryByText('Tenant 1')).toBeNull();
    fireEvent.change(within(menu).getByRole('searchbox'), { target: { value: 'zzz' } });
    expect(within(menu).getByText(/No organizations match/)).toBeTruthy();
  });

  it('choosing an organization of another tenant switches to it', () => {
    const select = renderSwitcher();
    const menu = openMenu();
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'XYZ' }));
    expect(select).toHaveBeenCalledWith(XYZ.id);
  });

  it('Enter in the search opens the first match', () => {
    const select = renderSwitcher();
    const menu = openMenu();
    const search = within(menu).getByRole('searchbox');
    fireEvent.change(search, { target: { value: 'xyz' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(select).toHaveBeenCalledWith(XYZ.id);
  });

  it('tells users without organizations', () => {
    renderWith(<ContextBar />, { tenancy: fakeTenancy({ tenants: [tenantDto()], myOrganizations: [] }) });
    expect(screen.getByText('No organization access')).toBeTruthy();
  });
});

describe('top bar layout', () => {
  it('breadcrumbs first, organization switcher in the middle, account last', () => {
    const tenancy = fakeTenancy({ tenants: [tenantDto()], myOrganizations: ORGS, selection: { tenant: T1, org: X.id, site: null, network: null } });
    renderWith(<TopBar onOpenNavigation={() => undefined} />, { tenancy });
    const header = screen.getByRole('banner');
    const order = [
      screen.getByRole('navigation', { name: 'Breadcrumb' }),
      screen.getByRole('button', { name: 'Organization: X' }),
      screen.getByRole('button', { name: 'Account menu' }),
    ];
    for (let i = 1; i < order.length; i += 1) {
      expect((order[i - 1] as HTMLElement).compareDocumentPosition(order[i] as HTMLElement) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(within(header).queryByRole('button', { name: /^Tenant:/ })).toBeNull();
    expect(within(header).queryByRole('button', { name: /^Site:/ })).toBeNull();
  });
});
