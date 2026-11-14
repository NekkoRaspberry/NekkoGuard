import { ChevronsLeft, ChevronsRight, X } from 'lucide-react';
import { Link, NavLink } from 'react-router';
import { ROUTES } from '@/app/routes';
import { Logo } from '@/components/Logo/Logo';
import { config } from '@/config/env';
import { cx } from '@/lib/cx';
import { useContextSearch, useIsPlatformAdmin, useTenancy } from '@/features/tenancy/hooks';
import { visibleNavigation } from '../navigation';
import { ConnectionIndicator } from './ConnectionIndicator';
import styles from './Sidebar.module.css';

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** Mobile drawer state. */
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({ collapsed, onToggleCollapsed, mobileOpen, onCloseMobile }: SidebarProps) {
  const { permissions, currentOrganization, currentTenant } = useTenancy();
  const isPlatformAdmin = useIsPlatformAdmin();
  const contextSearch = useContextSearch();
  const navigation = visibleNavigation({
    permissions,
    hasOrganization: currentOrganization !== null,
    hasTenantMembership: currentTenant?.role != null,
    isPlatformAdmin,
  });

  return (
    <>
      <div
        className={cx(styles.backdrop, mobileOpen && styles.backdropVisible)}
        onClick={onCloseMobile}
        aria-hidden="true"
      />
      <aside
        id="app-sidebar"
        className={cx(styles.sidebar, collapsed && styles.collapsed, mobileOpen && styles.mobileOpen)}
        aria-label="Main navigation"
      >
        <div className={styles.brand}>
          <Link to={ROUTES.overview} className={styles.brandLink} aria-label="NekkoGuard home" onClick={onCloseMobile}>
            <Logo withWordmark={!collapsed || mobileOpen} />
          </Link>
          <button type="button" className={styles.closeMobile} onClick={onCloseMobile} aria-label="Close navigation">
            <X size={18} />
          </button>
        </div>

        <nav className={styles.nav}>
          {navigation.map((group) => (
            <div key={group.label} className={styles.group}>
              <p className={styles.groupLabel}>{group.label}</p>
              <ul className={styles.list}>
                {group.items.map(({ label, to, icon: Icon, end }) => (
                  <li key={to}>
                    <NavLink
                      to={{ pathname: to, search: contextSearch }}
                      end={end ?? false}
                      className={({ isActive }) => cx(styles.item, isActive && styles.active)}
                      title={collapsed ? label : undefined}
                      onClick={onCloseMobile}
                    >
                      <Icon size={18} className={styles.itemIcon} aria-hidden="true" />
                      <span className={styles.itemLabel}>{label}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className={styles.footer}>
          <ConnectionIndicator compact={collapsed && !mobileOpen} />
          <button
            type="button"
            className={styles.collapseToggle}
            onClick={onToggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            aria-controls="app-sidebar"
          >
            {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
            <span className={styles.itemLabel}>Collapse</span>
          </button>
          <p className={styles.version} title={`NekkoGuard release ${config.appVersion}`}>
            {collapsed && !mobileOpen ? `v${config.appVersion}` : `NekkoGuard v${config.appVersion}`}
          </p>
        </div>
      </aside>
    </>
  );
}
