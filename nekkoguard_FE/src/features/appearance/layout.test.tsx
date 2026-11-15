// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { NavbarPosition } from '@/api/appearance';
import { ShellFrame } from '@/layout/AppShell/AppShell';
import { AppearanceContext, DEFAULT_APPEARANCE_CONTEXT, type AppearanceContextValue } from './AppearanceContext';
import { fakeTenancy, newQueryClient, organizationDto, renderWith, tenantDto } from './testing';

afterEach(cleanup);

function renderShell(appearance: Partial<AppearanceContextValue> | null = null) {
  const ui = appearance ? (
    <AppearanceContext.Provider value={{ ...DEFAULT_APPEARANCE_CONTEXT, ...appearance }}>
      <ShellFrame />
    </AppearanceContext.Provider>
  ) : (
    // No provider at all: the app as it was before white-labelling.
    <ShellFrame />
  );
  return renderWith(ui, { tenancy: fakeTenancy() });
}

const shellOf = (container: HTMLElement) => container.querySelector('#app-sidebar')?.parentElement as HTMLElement;
const sidebar = () => document.getElementById('app-sidebar') as HTMLElement;
/** The horizontal TopNav (the sidebar is an <aside>, not a <nav>, with the same label). */
const topNav = () => screen.queryByRole('navigation', { name: 'Main navigation' });
/** Radix generates ids per mount; they are not part of the layout. */
const stable = (html: string) => html.replace(/radix-_r_\w+_/g, 'radix-id');
const brandLink = () => screen.getAllByRole('link', { name: /home$/ })[0] as HTMLElement;

describe('default NekkoGuard appearance', () => {
  it('renders the original layout and branding when nothing is configured', () => {
    const { container } = renderShell();
    const shell = shellOf(container);
    expect(shell.getAttribute('data-nav-position')).toBeNull();
    const main = screen.getByRole('main').parentElement as HTMLElement;
    expect(sidebar().compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); // sidebar left of content
    expect(topNav()).toBeNull();
    expect(brandLink().getAttribute('aria-label')).toBe('NekkoGuard home');
    expect(within(brandLink()).getByText(/Nekko/).textContent).toBe('NekkoGuard');
    expect(within(brandLink()).queryByRole('img')).toBeNull();
  });

  it('an explicit "left" renders exactly the same markup as no configuration', () => {
    const { container: before } = renderShell();
    const original = stable(before.innerHTML);
    cleanup();
    const { container: after } = renderShell({ navbarPosition: 'left' });
    expect(stable(after.innerHTML)).toBe(original);
  });
});

describe('navbar position', () => {
  it.each<NavbarPosition>(['top', 'right'])('%s is applied to the shell', (position) => {
    const { container } = renderShell({ navbarPosition: position });
    expect(shellOf(container).getAttribute('data-nav-position')).toBe(position);
  });

  it('top adds a horizontal navigation and keeps the sidebar as the mobile drawer', () => {
    renderShell({ navbarPosition: 'top' });
    const top = topNav() as HTMLElement;
    expect(top).toBeTruthy();
    expect(sidebar()).toBeTruthy(); // still rendered: the mobile drawer
    // Overview stays a link; each other group is a dropdown.
    expect(within(top).getByRole('link', { name: /Overview/ })).toBeTruthy();
    expect(within(top).getByRole('button', { name: /Settings/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open navigation' })).toBeTruthy();
  });

  it('marks the active route in the top navigation', () => {
    renderShell({ navbarPosition: 'top' });
    const top = topNav() as HTMLElement;
    expect(within(top).getByRole('link', { name: /Overview/ }).getAttribute('aria-current')).toBe('page');
  });

  it('right keeps every navigation item and the active indicator', () => {
    renderShell({ navbarPosition: 'right' });
    for (const label of ['Overview', 'Profile']) {
      expect(within(sidebar()).getByRole('link', { name: label })).toBeTruthy();
    }
    expect(within(sidebar()).getByRole('link', { name: 'Overview' }).getAttribute('aria-current')).toBe('page');
    expect(topNav()).toBeNull();
  });
});

describe('branding', () => {
  it('shows the custom title and logo in the navigation', () => {
    renderShell({ title: 'Acme Guard', logoUrl: '/api/tenants/t/appearance/logo/?v=abc' });
    expect(brandLink().getAttribute('aria-label')).toBe('Acme Guard home');
    expect(within(brandLink()).getByText('Acme Guard')).toBeTruthy();
    expect(brandLink().querySelector('img')?.getAttribute('src')).toBe('/api/tenants/t/appearance/logo/?v=abc');
  });

  it('keeps the product version line (not branding) unchanged', () => {
    renderShell({ title: 'Acme Guard' });
    expect(screen.getByText(/^NekkoGuard v/)).toBeTruthy();
  });
});

describe('Settings navigation', () => {
  const settingsLinks = () =>
    within(sidebar())
      .getAllByRole('link')
      .map((link) => link.textContent)
      .filter((label) => label === 'Tenant' || label === 'Organization' || label === 'Profile');

  it('lists Tenant, Organization and Profile in that order', () => {
    const tenant = tenantDto(['tenant.view', 'tenant.appearance.manage'], 'admin');
    renderWith(<ShellFrame />, {
      tenancy: fakeTenancy({
        currentTenant: tenant,
        tenants: [tenant],
        currentOrganization: organizationDto([]),
        tenantPermissions: new Set(tenant.permissions),
      }),
    });
    expect(settingsLinks()).toEqual(['Tenant', 'Organization', 'Profile']);
  });

  it.each([
    ['organization administrator', ['organization.manage', 'members.manage']],
    ['security analyst', ['sites.view', 'activity.view']],
    ['operator / viewer', ['sites.view', 'networks.view']],
  ])('an %s never sees the Tenant entry', (_label, orgPermissions) => {
    const tenant = tenantDto(['tenant.view'], 'member');
    renderWith(<ShellFrame />, {
      tenancy: fakeTenancy({
        currentTenant: tenant,
        tenants: [tenant],
        currentOrganization: organizationDto(orgPermissions),
        permissions: new Set(orgPermissions),
        tenantPermissions: new Set(['tenant.view']),
      }),
    });
    expect(settingsLinks()).toEqual(['Organization', 'Profile']);
  });

  it('top navigation: Settings opens a list of styled entries, the active one marked', () => {
    const tenant = tenantDto(['tenant.view', 'tenant.manage'], 'admin');
    renderWith(
      <AppearanceContext.Provider value={{ ...DEFAULT_APPEARANCE_CONTEXT, navbarPosition: 'top' }}>
        <ShellFrame />
      </AppearanceContext.Provider>,
      {
        tenancy: fakeTenancy({
          currentTenant: tenant,
          tenants: [tenant],
          currentOrganization: organizationDto([]),
          tenantPermissions: new Set(tenant.permissions),
        }),
        route: '/settings/profile',
      },
    );
    const top = topNav() as HTMLElement;
    fireEvent.pointerDown(within(top).getByRole('button', { name: /Settings/ }), { button: 0, pointerType: 'mouse' });
    const entries = within(screen.getByRole('menu')).getAllByRole('menuitem');
    expect(entries.map((e) => e.textContent)).toEqual(['Tenant', 'Organization', 'Profile']);
    for (const entry of entries) {
      expect(entry.className).not.toMatch(/function|=>/); // real class names, not stringified callbacks
      expect(entry.className.length).toBeGreaterThan(0);
    }
    expect(entries[2]?.getAttribute('aria-current')).toBe('page');
    expect(entries[0]?.getAttribute('aria-current')).toBeNull();
  });

  it('has no platform, configuration or separate account entries', () => {
    renderWith(<ShellFrame />, { tenancy: fakeTenancy(), client: newQueryClient({ isStaff: true }) });
    for (const label of ['Platform', 'Configuration', 'Account', 'Appearance', 'Security', 'Connected apps']) {
      expect(within(sidebar()).queryByText(label)).toBeNull();
    }
    expect(within(sidebar()).getByRole('link', { name: 'Profile' }).getAttribute('href')).toBe('/settings/profile');
  });
});

describe('responsive sidebar (expanded → rail → drawer)', () => {
  const original = window.matchMedia;
  /** Answers `(min-width: Npx)` queries for a viewport `width` pixels wide. */
  function viewport(width: number) {
    window.matchMedia = ((query: string) => {
      const min = Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? 0);
      return {
        matches: width >= min,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      } as unknown as MediaQueryList;
    }) as typeof window.matchMedia;
  }
  const wordmark = () => within(brandLink()).queryByText(/Nekko/);

  afterEach(() => {
    window.matchMedia = original;
    window.localStorage.clear();
  });

  it('wide screens: expanded by default, with the collapse toggle', () => {
    viewport(1280);
    renderShell();
    expect(wordmark()).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toBeTruthy();
  });

  it('wide screens: keep the user’s collapsed choice', () => {
    viewport(1280);
    window.localStorage.setItem('nekkoguard.sidebar.collapsed', 'true');
    renderShell();
    expect(wordmark()).toBeNull();
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeTruthy();
  });

  it('medium screens: the icon rail is forced (not hidden) and the saved choice is untouched', () => {
    viewport(800);
    renderShell();
    expect(sidebar()).toBeTruthy();
    expect(wordmark()).toBeNull(); // rail
    expect(within(sidebar()).getByRole('link', { name: 'Overview' }).getAttribute('title')).toBe('Overview'); // tooltip
    expect(screen.queryByRole('button', { name: /(Collapse|Expand) sidebar/ })).toBeNull();
    expect(window.localStorage.getItem('nekkoguard.sidebar.collapsed')).toBeNull();
  });

  it('medium screens with the top navigation use the rail too', () => {
    viewport(800);
    renderShell({ navbarPosition: 'top' });
    expect(topNav()).toBeNull();
    expect(wordmark()).toBeNull();
  });

  it('phones: the drawer shows full labels', () => {
    viewport(400);
    window.localStorage.setItem('nekkoguard.sidebar.collapsed', 'true');
    renderShell();
    expect(wordmark()).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open navigation' })).toBeTruthy();
  });
});
