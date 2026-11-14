import { NavLink, Outlet } from 'react-router';
import { ROUTES } from '@/app/routes';
import { useContextSearch, useIsPlatformAdmin, useTenancy } from '@/features/tenancy/hooks';
import { TENANT_PERMISSIONS } from '@/features/tenancy/model';
import { cx } from '@/lib/cx';
import { organizationCapabilities } from './capabilities';
import styles from './Settings.module.css';

interface Link {
  label: string;
  to: string;
  end?: boolean;
}

interface Section {
  label: string;
  links: Link[];
}

/** Settings with its own secondary navigation; only sections the user can use are listed. */
export function SettingsLayout() {
  const { currentOrganization, currentTenant, tenantPermissions } = useTenancy();
  const isPlatformAdmin = useIsPlatformAdmin();
  const search = useContextSearch();

  const sections: Section[] = [];
  if (currentOrganization) {
    const can = organizationCapabilities(currentOrganization, tenantPermissions);
    const links: Link[] = [{ label: 'Details', to: ROUTES.organizationSettings, end: true }];
    if (can.canManageAccess) {
      links.push({ label: 'Members', to: ROUTES.organizationMembers });
      links.push({ label: 'Access & permissions', to: ROUTES.organizationAccess });
    }
    if (can.canViewActivity) links.push({ label: 'Activity', to: ROUTES.organizationActivity });
    sections.push({ label: currentOrganization.name, links });
  }
  if (currentTenant?.role) {
    const links: Link[] = [
      { label: 'Details', to: ROUTES.tenantSettings, end: true },
      { label: 'Organizations', to: ROUTES.tenantOrganizations },
    ];
    if (tenantPermissions.has(TENANT_PERMISSIONS.manageMembers)) links.push({ label: 'Members', to: ROUTES.tenantMembers });
    if (tenantPermissions.has(TENANT_PERMISSIONS.viewActivity)) links.push({ label: 'Activity', to: ROUTES.tenantActivity });
    sections.push({ label: `Tenant · ${currentTenant.name}`, links });
  }
  if (isPlatformAdmin) {
    sections.push({ label: 'Platform', links: [{ label: 'Tenants', to: ROUTES.platformTenants }] });
  }

  return (
    <div className={styles.layout}>
      <nav className={styles.nav} aria-label="Settings">
        {sections.map((section) => (
          <div key={section.label} className={styles.section}>
            <p className={styles.sectionLabel}>{section.label}</p>
            <ul className={styles.list}>
              {section.links.map((link) => (
                <li key={link.to}>
                  <NavLink
                    to={{ pathname: link.to, search }}
                    end={link.end ?? false}
                    className={({ isActive }) => cx(styles.link, isActive && styles.active)}
                  >
                    {link.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className={styles.content}>
        <Outlet />
      </div>
    </div>
  );
}
