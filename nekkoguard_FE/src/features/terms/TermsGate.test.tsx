// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from '@/api/client';
import { termsApi } from '@/api/terms';
import { renderWith } from '@/features/appearance/testing';
import { AuthContext, type AuthContextValue } from '@/features/auth/AuthContext';
import { versionDto } from './fixtures';
import { TermsGate } from './TermsGate';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function setup(signOut = vi.fn(async () => undefined)) {
  const auth = {
    status: 'authenticated',
    isAuthenticated: true,
    user: { id: 1, email: 'me@example.test' },
    flows: [],
    pendingFlow: null,
    lastSignOutReason: null,
    applySession: vi.fn(),
    signOut,
  } as unknown as AuthContextValue;
  renderWith(
    <AuthContext.Provider value={auth}>
      <TermsGate>
        <p>The application</p>
      </TermsGate>
    </AuthContext.Provider>,
  );
  return { signOut };
}

describe('mandatory Terms acceptance', () => {
  it('lets users without pending Terms straight in', async () => {
    vi.spyOn(termsApi, 'pending').mockResolvedValue([]);
    setup();
    expect(await screen.findByText('The application')).toBeTruthy();
  });

  it('shows the full Terms instead of the app until they are accepted', async () => {
    const version = versionDto();
    const pending = vi.spyOn(termsApi, 'pending').mockResolvedValueOnce([version]).mockResolvedValue([]);
    const accept = vi.spyOn(termsApi, 'accept').mockResolvedValue({ accepted: true, pending: 0 });
    setup();
    const article = await screen.findByRole('article', { name: 'Acme Terms' });
    expect(screen.queryByText('The application')).toBeNull();
    expect(within(article).getByText(/Version/).textContent).toContain('2');
    // The table of contents works inside the acceptance screen too.
    expect(screen.getByRole('link', { name: '2.Definitions' }).getAttribute('href')).toBe('#accept-definitions');
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(accept).toHaveBeenCalledWith(version.id));
    expect(await screen.findByText('The application')).toBeTruthy();
    expect(pending).toHaveBeenCalledTimes(2);
  });

  it('declining is recorded and signs the user out, without accepting', async () => {
    vi.spyOn(termsApi, 'pending').mockResolvedValue([versionDto()]);
    const decline = vi.spyOn(termsApi, 'decline').mockResolvedValue({ signed_out: true });
    const accept = vi.spyOn(termsApi, 'accept');
    const { signOut } = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Decline' }));
    fireEvent.click(screen.getByRole('button', { name: 'Decline and sign out' }));
    await waitFor(() => expect(signOut).toHaveBeenCalledWith('terms_declined'));
    expect(decline).toHaveBeenCalledTimes(1);
    expect(accept).not.toHaveBeenCalled();
  });

  it('signs out locally even if the decline request fails', async () => {
    vi.spyOn(termsApi, 'pending').mockResolvedValue([versionDto()]);
    vi.spyOn(termsApi, 'decline').mockRejectedValue(new Error('offline'));
    const { signOut } = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Decline' }));
    fireEvent.click(screen.getByRole('button', { name: 'Decline and sign out' }));
    await waitFor(() => expect(signOut).toHaveBeenCalledWith('terms_declined'));
  });

  it('a blocked request anywhere in the app brings the acceptance screen back', async () => {
    const pending = vi.spyOn(termsApi, 'pending').mockResolvedValueOnce([]).mockResolvedValue([versionDto({ number: 3 })]);
    setup();
    await screen.findByText('The application');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ detail: 'x', code: 'terms_acceptance_required' }), { status: 403 })),
    );
    await expect(apiRequest('/api/tenants/')).rejects.toThrow();
    expect(await screen.findByRole('article', { name: 'Acme Terms' })).toBeTruthy();
    expect(pending).toHaveBeenCalledTimes(2);
  });
});
