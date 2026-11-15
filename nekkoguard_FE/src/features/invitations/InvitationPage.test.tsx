// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/errors';
import { tenancyApi, type InvitationLinkDto } from '@/api/tenancy';
import { AuthContext, type AuthContextValue } from '@/features/auth/AuthContext';
import { InvitationPage } from './InvitationPage';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const TOKEN = 'a'.repeat(43);
const PENDING: InvitationLinkDto = {
  status: 'pending',
  email: 'new@corp.example',
  organization_name: 'Acme HQ',
  invited_by: 'Jane Admin',
  role: 'viewer',
  expires_at: '2026-12-01T00:00:00Z',
};

function Where() {
  const { pathname, search, state } = useLocation();
  return <p data-testid="where">{`${pathname}${search}|${JSON.stringify(state)}`}</p>;
}

function renderPage({ signedInAs = null as string | null } = {}) {
  const auth = {
    status: signedInAs ? 'authenticated' : 'anonymous',
    isAuthenticated: signedInAs !== null,
    user: signedInAs ? { id: 42, email: signedInAs } : null,
  } as unknown as AuthContextValue;
  const router = createMemoryRouter(
    [
      { path: '/invitations/:token', element: <InvitationPage /> },
      { path: '*', element: <Where /> },
    ],
    { initialEntries: [`/invitations/${TOKEN}`] },
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={auth}>
        <RouterProvider router={router} />
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

describe('InvitationPage', () => {
  it('signed out: offers to create the account with the invited address, or sign in', async () => {
    vi.spyOn(tenancyApi, 'getInvitationLink').mockResolvedValue(PENDING);
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Join Acme HQ' })).toBeTruthy();
    expect(screen.getByText('Jane Admin')).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: 'Create your account' }));
    const where = screen.getByTestId('where').textContent ?? '';
    expect(where).toContain('/signup|');
    expect(where).toContain('new@corp.example');
  });

  it('signed out: sign-in returns to this invitation', async () => {
    vi.spyOn(tenancyApi, 'getInvitationLink').mockResolvedValue(PENDING);
    renderPage();
    fireEvent.click(await screen.findByRole('link', { name: 'Sign in to accept' }));
    expect(screen.getByTestId('where').textContent).toBe(`/login|{"from":"/invitations/${TOKEN}"}`);
  });

  it('signed in: accepting opens the organization', async () => {
    vi.spyOn(tenancyApi, 'getInvitationLink').mockResolvedValue(PENDING);
    const accept = vi.spyOn(tenancyApi, 'acceptInvitation').mockResolvedValue({
      tenant: 't1',
      organization: 'o1',
      organization_name: 'Acme HQ',
      already_member: false,
    });
    renderPage({ signedInAs: 'new@corp.example' });
    fireEvent.click(await screen.findByRole('button', { name: 'Accept invitation' }));
    await waitFor(() => expect(accept).toHaveBeenCalledWith(TOKEN));
    // No ids in the URL: the new organization is remembered and opened next.
    expect((await screen.findByTestId('where')).textContent).toBe('/|null');
    expect(window.localStorage.getItem('nekkoguard.context.42.tenant')).toBe('t1');
    expect(window.localStorage.getItem('nekkoguard.context.42.orgByTenant')).toBe('{"t1":"o1"}');
  });

  it('signed in with another account: warns before trying', async () => {
    vi.spyOn(tenancyApi, 'getInvitationLink').mockResolvedValue(PENDING);
    renderPage({ signedInAs: 'someone@else.example' });
    expect(await screen.findByText(/You are signed in as someone@else.example/)).toBeTruthy();
  });

  it.each([
    ['expired', 'Invitation expired'],
    ['revoked', 'Invitation withdrawn'],
    ['accepted', 'Invitation already used'],
  ] as const)('%s invitations cannot be used', async (status, title) => {
    vi.spyOn(tenancyApi, 'getInvitationLink').mockResolvedValue({ status });
    renderPage();
    expect(await screen.findByRole('heading', { name: title })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Accept invitation' })).toBeNull();
  });

  it('unknown links are reported as not valid', async () => {
    vi.spyOn(tenancyApi, 'getInvitationLink').mockRejectedValue(new ApiError({ kind: 'http', message: 'Not found', status: 404 }));
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Invitation link not valid' })).toBeTruthy();
  });
});
