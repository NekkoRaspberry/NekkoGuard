import type { ReactNode } from 'react';
import { Navigate, NavLink, Outlet, useMatches } from 'react-router';
import { Banner } from '@/components/Banner/Banner';
import { ROUTES } from '@/app/routes';
import { useCurrentUser } from '@/features/account/hooks/useCurrentUser';
import { useImpersonation } from '@/features/impersonation/useImpersonation';
import { useIsPlatformAdmin, useTenancy, useTenantName } from '@/features/tenancy/hooks';
import { canAdministerTenant, TENANT_PERMISSIONS } from '@/features/tenancy/model';
import { PageHeader } from '@/layout/PageHeader/PageHeader';
import type { RouteHandle } from '@/layout/TopBar/TopBar';
import { cx } from '@/lib/cx';
import { canManageOrganizationAppearance, canManageTenantAppearance, organizationCapabilities } from './capabilities';
import styles from './Settings.module.css';

interface Link {
  label: string;
  to: string;
  end?: boolean;
}

/** Title of the innermost route that declares one (see `RouteHandle.page`). */
function usePageTitle(): RouteHandle['page'] {
  const matches = useMatches();
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const page = (matches[i]?.handle as RouteHandle | undefined)?.page;
    if (page) return page;
  }
  return undefined;
}

/**
 * Shared frame of every settings area (Tenant, Organization, Profile).
 *
 * The page header spans the full width, so settings pages start at the same horizontal
 * position as every other page; the area's own navigation and the page content follow.
 * Pages therefore declare their title in the route handle instead of rendering one.
 */
/** Fills `{tenant}` with the selected Tenant's name (users may belong to several). */
function withNames(text: string, tenantName: string): string {
  return text.replaceAll('{tenant}', tenantName);
}

function SettingsFrame({
  label,
  links,
  replacement,
}: {
  label: string;
  links: Link[];
  /** Shown instead of the page (e.g. Profile while viewing as another user). */
  replacement?: ReactNode;
}) {
  const page = usePageTitle();
  const tenantName = useTenantName();

  return (
    <div className={styles.frame}>
      {page && <PageHeader title={withNames(page.title, tenantName)} description={withNames(page.description, tenantName)} />}
      <div className={styles.layout}>
        <nav className={styles.nav} aria-label={`${label} settings`}>
          <p className={styles.sectionLabel} title={label}>
            {label}
          </p>
          <ul className={styles.list}>
            {links.map((link) => (
              <li key={link.to}>
                <NavLink
                  to={link.to}
                  end={link.end ?? false}
                  className={({ isActive }) => cx(styles.link, isActive && styles.active)}
                >
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className={styles.content}>{replacement ?? <Outlet />}</div>
      </div>
    </div>
  );
}

/** Settings → Tenant: the Tenant selected in the context bar, nothing else. */
export function TenantSettingsLayout() {
  const { currentTenant, tenantPermissions } = useTenancy();
  const isPlatformAdmin = useIsPlatformAdmin();
  const links: Link[] = [{ label: 'Details', to: ROUTES.tenantSettings, end: true }];
  if (currentTenant && canAdministerTenant(tenantPermissions)) {
    links.push({ label: 'Organizations', to: ROUTES.tenantOrganizations });
    if (tenantPermissions.has(TENANT_PERMISSIONS.manageMembers)) links.push({ label: 'Members', to: ROUTES.tenantMembers });
    if (tenantPermissions.has(TENANT_PERMISSIONS.viewActivity)) links.push({ label: 'Activity', to: ROUTES.tenantActivity });
    if (tenantPermissions.has(TENANT_PERMISSIONS.manage)) links.push({ label: 'Terms of Service', to: ROUTES.tenantTerms });
    if (canManageTenantAppearance(tenantPermissions, isPlatformAdmin)) {
      links.push({ label: 'Appearance', to: ROUTES.tenantAppearance });
    }
  }
  return <SettingsFrame label={currentTenant?.name ?? 'Tenant'} links={links} />;
}

/** Settings → Organization: the Organization selected in the context bar, nothing else. */
export function OrganizationSettingsLayout() {
  const { currentOrganization, permissions, tenantPermissions } = useTenancy();
  const isPlatformAdmin = useIsPlatformAdmin();
  const links: Link[] = [{ label: 'Details', to: ROUTES.organizationSettings, end: true }];
  if (currentOrganization) {
    const can = organizationCapabilities(currentOrganization, tenantPermissions);
    if (can.canViewAccess) {
      links.push({ label: 'Members', to: ROUTES.organizationMembers });
      links.push({ label: 'Permissions', to: ROUTES.organizationAccess });
    }
    if (can.canViewActivity) links.push({ label: 'Activity', to: ROUTES.organizationActivity });
    if (can.canViewAccess) links.push({ label: 'Terms of Service', to: ROUTES.organizationTerms });
    // Tenant rights count here only if the Organization is in the caller's scope.
    const tenantRights = currentOrganization.can_administer ? tenantPermissions : new Set<string>();
    if (canManageOrganizationAppearance(permissions, tenantRights, isPlatformAdmin)) {
      links.push({ label: 'Appearance', to: ROUTES.organizationAppearance });
    }
  }
  return <SettingsFrame label={currentOrganization?.name ?? 'Organization'} links={links} />;
}

/** Settings → Profile: the signed-in user's own account, whatever the selected context. */
export function ProfileSettingsLayout() {
  const { data: user } = useCurrentUser();
  const viewing = useImpersonation().data?.active === true;
  return (
    <SettingsFrame
      label={user?.name || user?.email || 'Your account'}
      replacement={
        viewing ? (
          <Banner tone="info" title="Not available while viewing as another user">
            Profile, security and connected applications always belong to your own account. Go back to your account to
            see or change them.
          </Banner>
        ) : undefined
      }
      links={[
        { label: 'Personal information', to: ROUTES.profile, end: true },
        { label: 'Security', to: ROUTES.security },
        { label: 'Connected applications', to: ROUTES.connectedApps },
      ]}
    />
  );
}

/** `/settings` → the first settings area the user has, in navigation order. */
export function SettingsIndex() {
  const { ready, tenants, tenantsError, tenantPermissions, currentOrganization } = useTenancy();
  if (!tenantsError && (!tenants || (tenants.length > 0 && !ready))) return null;
  const to = canAdministerTenant(tenantPermissions)
    ? ROUTES.tenantSettings
    : currentOrganization
      ? ROUTES.organizationSettings
      : ROUTES.profile;
  return <Navigate to={to} replace />;
}
