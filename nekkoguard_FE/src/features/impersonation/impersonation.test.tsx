// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { impersonationApi, type ImpersonationStatusDto } from '@/api/impersonation';
import { queryKeys } from '@/api/queryKeys';
import { fakeTenancy, newQueryClient, renderWith } from '@/features/appearance/testing';
import { ProfileSettingsLayout } from '@/features/settings/SettingsLayout';
import { UserMenu } from '@/layout/TopBar/UserMenu';
import { ImpersonationBanner } from './ImpersonationBanner';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const ROOT = { id: 1, email: 'root@example.test', name: 'Root' };
const CLIENT = { id: 7, email: 'client@corp.example', name: 'Client' };

const NOT_AVAILABLE: ImpersonationStatusDto = { available: false, active: false, user: null };
const AVAILABLE: ImpersonationStatusDto = { available: true, active: false, user: null, real_user: ROOT };
const VIEWING: ImpersonationStatusDto = { available: true, active: true, user: CLIENT, real_user: ROOT };

function renderWithStatus(ui: React.ReactElement, status: ImpersonationStatusDto) {
  const client = newQueryClient();
  client.setQueryData(queryKeys.impersonation, status);
  return renderWith(ui, { tenancy: fakeTenancy(), client });
}

const openAccountMenu = (name = /Account menu/) => {
  fireEvent.pointerDown(screen.getByRole('button', { name }), { button: 0, pointerType: 'mouse' });
  return screen.getByRole('menu');
};

describe('view as user (account menu)', () => {
  it('is not offered to anyone but superusers', () => {
    renderWithStatus(<UserMenu />, NOT_AVAILABLE);
    const menu = openAccountMenu();
    expect(within(menu).queryByRole('menuitem', { name: 'View as another user' })).toBeNull();
  });

  it('superusers open a searchable user list from their name and pick a user', async () => {
    const users = vi.spyOn(impersonationApi, 'users').mockResolvedValue([CLIENT]);
    const start = vi.spyOn(impersonationApi, 'start').mockReturnValue(new Promise(() => undefined));
    renderWithStatus(<UserMenu />, AVAILABLE);
    const menu = openAccountMenu();
    const name = within(menu).getByRole('menuitem', { name: 'View as another user' });
    fireEvent.keyDown(name, { key: 'ArrowRight' });

    const search = await screen.findByRole('searchbox', { name: 'Search users' });
    fireEvent.change(search, { target: { value: 'corp' } });
    await waitFor(() => expect(users).toHaveBeenCalledWith('corp', expect.anything()));
    expect(screen.getByText(/Read-only: changes are disabled/)).toBeTruthy();
    fireEvent.click(await screen.findByRole('menuitem', { name: /client@corp\.example/ }));
    await waitFor(() => expect(start).toHaveBeenCalledWith(CLIENT.id));
  });

  it('while viewing: the switcher stays, with a way back', async () => {
    const stop = vi.spyOn(impersonationApi, 'stop').mockReturnValue(new Promise(() => undefined));
    renderWithStatus(<UserMenu />, VIEWING);
    const menu = openAccountMenu(/viewing as/);
    expect(within(menu).getByText('Viewing as')).toBeTruthy();
    expect(within(menu).getByRole('menuitem', { name: 'View as another user' })).toBeTruthy();
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Back to my account' }));
    await waitFor(() => expect(stop).toHaveBeenCalled());
  });
});

describe('while viewing as another user', () => {
  it('a banner names both identities', () => {
    renderWithStatus(<ImpersonationBanner />, VIEWING);
    expect(screen.getByText('Viewing NekkoGuard as Client (client@corp.example)')).toBeTruthy();
    expect(screen.getByText(/still signed in as root@example.test/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back to my account' })).toBeTruthy();
  });

  it('no banner otherwise', () => {
    renderWithStatus(<ImpersonationBanner />, AVAILABLE);
    expect(screen.queryByText(/Viewing NekkoGuard as/)).toBeNull();
  });

  it('profile settings (own account only) are not shown', () => {
    renderWithStatus(<ProfileSettingsLayout />, VIEWING);
    expect(screen.getByText('Not available while viewing as another user')).toBeTruthy();
  });
});
