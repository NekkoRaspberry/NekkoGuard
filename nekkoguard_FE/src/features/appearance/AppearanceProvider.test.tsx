// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appearanceApi, type AppearanceDto } from '@/api/appearance';
import { ApiError } from '@/api/errors';
import { AppearanceProvider } from './AppearanceProvider';
import { useEffectiveAppearance } from './hooks';
import {
  appearanceDto,
  fakeTenancy,
  newQueryClient,
  ORG_ID,
  OTHER_ORG_ID,
  Providers,
  renderWith,
  TENANT_ID,
  tenancyFor,
} from './testing';

const root = document.documentElement;
const favicon = () => document.head.querySelector('link[rel~="icon"]') as HTMLLinkElement;

function Probe() {
  const { title, navbarPosition } = useEffectiveAppearance();
  return <p data-testid="probe">{`${title ?? '-'}|${navbarPosition}`}</p>;
}

const app = (
  <AppearanceProvider>
    <Probe />
  </AppearanceProvider>
);

/** Answers GET appearance per scope (org id or 'tenant'). */
function serve(responses: Record<string, AppearanceDto | Promise<AppearanceDto> | Error>) {
  return vi.spyOn(appearanceApi, 'get').mockImplementation(async (_tenantId, orgId) => {
    const response = responses[orgId ?? 'tenant'];
    if (response instanceof Error) throw response;
    if (!response) throw new Error(`unexpected scope ${orgId}`);
    return response;
  });
}

const customized = (values: Parameters<typeof appearanceDto>[0] = {}) =>
  appearanceDto({
    effective: { title: 'Acme Guard', primary_color: '#ff0000', navbar_position: 'top', favicon_url: '/fav?v=1' },
    ...values,
  });

beforeEach(() => {
  document.head.innerHTML = '<link rel="icon" type="image/svg+xml" href="/favicon.svg" />';
  document.title = 'NekkoGuard';
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function expectDefaults() {
  expect(root.style.getPropertyValue('--primary')).toBe('');
  expect(root.getAttribute('style') ?? '').toBe('');
  expect(document.title).toBe('NekkoGuard');
  expect(favicon().getAttribute('href')).toBe('/favicon.svg');
}

describe('AppearanceProvider', () => {
  it('leaves the default appearance untouched without a tenant', () => {
    const spy = serve({});
    renderWith(app, { tenancy: fakeTenancy() });
    expect(spy).not.toHaveBeenCalled();
    expectDefaults();
    expect(screen.getByTestId('probe').textContent).toBe('-|left');
  });

  it('leaves the default appearance untouched for an uncustomized tenant', async () => {
    const spy = serve({ tenant: appearanceDto() });
    renderWith(app, { tenancy: tenancyFor({}) });
    await waitFor(() => expect(spy).toHaveBeenCalled());
    await act(async () => undefined);
    expectDefaults();
  });

  it('applies the tenant appearance: colors, title, favicon and navigation position', async () => {
    serve({ tenant: customized() });
    renderWith(app, { tenancy: tenancyFor({}) });
    await waitFor(() => expect(root.style.getPropertyValue('--primary')).toBe('#ff0000'));
    expect(root.style.getPropertyValue('--accent')).toBe(''); // not configured → tokens.css
    expect(document.title).toBe('Acme Guard');
    expect(favicon().getAttribute('href')).toBe('/fav?v=1');
    expect(screen.getByTestId('probe').textContent).toBe('Acme Guard|top');
  });

  it('uses the organization appearance when an organization is selected', async () => {
    const spy = serve({ [ORG_ID]: customized({ effective: { title: 'HQ', primary_color: '#00ff00' } }) });
    renderWith(app, { tenancy: tenancyFor({ orgPermissions: ['sites.view'] }) });
    await waitFor(() => expect(document.title).toBe('HQ'));
    expect(spy).toHaveBeenCalledWith(TENANT_ID, ORG_ID, expect.anything());
    expect(root.style.getPropertyValue('--primary')).toBe('#00ff00');
  });

  it('switching to an uncustomized organization never shows the previous branding', async () => {
    let release: (dto: AppearanceDto) => void = () => undefined;
    const pending = new Promise<AppearanceDto>((resolve) => (release = resolve));
    serve({ [ORG_ID]: customized(), [OTHER_ORG_ID]: pending });
    const view = renderWith(app, { tenancy: tenancyFor({ orgPermissions: [] }) });
    await waitFor(() => expect(document.title).toBe('Acme Guard'));

    view.switchTo(tenancyFor({ orgPermissions: [], orgId: OTHER_ORG_ID }));
    // While the new context loads: NekkoGuard defaults, not the previous organization.
    await waitFor(() => expectDefaults());
    await act(async () => release(appearanceDto()));
    expectDefaults();
  });

  it('falls back to the defaults when the appearance cannot be loaded', async () => {
    serve({ tenant: new ApiError({ kind: 'http', status: 500, message: 'boom' }) });
    renderWith(app, { tenancy: tenancyFor({}) });
    await act(async () => undefined);
    expectDefaults();
  });

  it('restores NekkoGuard when the app shell unmounts (sign-out)', async () => {
    serve({ tenant: customized() });
    const view = renderWith(app, { tenancy: tenancyFor({}) });
    await waitFor(() => expect(document.title).toBe('Acme Guard'));
    view.unmount();
    expectDefaults();
    expect(window.localStorage.getItem('nekkoguard.appearance')).toBeNull();
  });

  it('reuses the cached appearance only for the same context while it reloads', async () => {
    serve({ tenant: customized() });
    const first = renderWith(app, { tenancy: tenancyFor({}) });
    await waitFor(() => expect(document.title).toBe('Acme Guard'));
    const cached = window.localStorage.getItem('nekkoguard.appearance');
    first.unmount();

    // Reload of the same tenant: applied immediately, before the request returns.
    window.localStorage.setItem('nekkoguard.appearance', cached ?? '');
    vi.spyOn(appearanceApi, 'get').mockReturnValue(new Promise(() => undefined));
    render(
      <Providers tenancy={tenancyFor({})} client={newQueryClient()}>
        {app}
      </Providers>,
    );
    expect(document.title).toBe('Acme Guard');
    cleanup();

    // Another organization: never the cached tenant branding.
    window.localStorage.setItem('nekkoguard.appearance', cached ?? '');
    render(
      <Providers tenancy={tenancyFor({ orgPermissions: [] })} client={newQueryClient()}>
        {app}
      </Providers>,
    );
    expect(document.title).toBe('NekkoGuard');
  });
});
