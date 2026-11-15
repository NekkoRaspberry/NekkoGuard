import { ChevronsLeft, ChevronsRight, X } from 'lucide-react';
import { Link, NavLink } from 'react-router';
import { ROUTES } from '@/app/routes';
import { Logo } from '@/components/Logo/Logo';
import { config } from '@/config/env';
import { cx } from '@/lib/cx';
import { useEffectiveAppearance } from '@/features/appearance/hooks';
import { useBugReport } from '@/features/help/useBugReport';
import { isLinkItem, navItemKey } from '../navigation';
import { useNavigation } from '../useNavigation';
import { ConnectionIndicator } from './ConnectionIndicator';
import styles from './Sidebar.module.css';

interface SidebarProps {
  /** Icon rail: the user's choice on wide screens, forced on medium ones. */
  collapsed: boolean;
  /** False while the rail is forced (no room to expand): the toggle is hidden. */
  canToggle?: boolean;
  onToggleCollapsed: () => void;
  /** Mobile drawer state. */
  mobileOpen: boolean;
  onCloseMobile: () => void;
  /**
   * White-label navigation position. `left` (default) is the original layout.
   * `right` mirrors it; `top` keeps this sidebar only as the mobile drawer (the
   * desktop navigation is then `TopNav`).
   */
  placement?: 'left' | 'right' | 'top';
}

export function Sidebar({ collapsed, canToggle = true, onToggleCollapsed, mobileOpen, onCloseMobile, placement = 'left' }: SidebarProps) {
  const { title, logoUrl } = useEffectiveAppearance();
  const navigation = useNavigation();
  const { openBugReport } = useBugReport();
  const ExpandIcon = placement === 'right' ? ChevronsLeft : ChevronsRight;
  const CollapseIcon = placement === 'right' ? ChevronsRight : ChevronsLeft;

  return (
    <>
      <div
        className={cx(styles.backdrop, mobileOpen && styles.backdropVisible)}
        onClick={onCloseMobile}
        aria-hidden="true"
      />
      <aside
        id="app-sidebar"
        className={cx(
          styles.sidebar,
          collapsed && styles.collapsed,
          mobileOpen && styles.mobileOpen,
          placement === 'right' && styles.placeRight,
          placement === 'top' && styles.placeTop,
        )}
        aria-label="Main navigation"
      >
        <div className={styles.brand}>
          <Link to={ROUTES.overview} className={styles.brandLink} aria-label={`${title ?? 'NekkoGuard'} home`} onClick={onCloseMobile}>
            <Logo withWordmark={!collapsed || mobileOpen} imageSrc={logoUrl} title={title} />
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
                {group.items.map((item) => {
                  const { label, icon: Icon } = item;
                  const content = (
                    <>
                      <Icon size={18} className={styles.itemIcon} aria-hidden="true" />
                      <span className={styles.itemLabel}>{label}</span>
                    </>
                  );
                  return (
                    <li key={navItemKey(item)}>
                      {isLinkItem(item) ? (
                        <NavLink
                          to={item.to}
                          end={item.end ?? false}
                          className={({ isActive }) => cx(styles.item, isActive && styles.active)}
                          title={collapsed ? label : undefined}
                          onClick={onCloseMobile}
                        >
                          {content}
                        </NavLink>
                      ) : (
                        <button
                          type="button"
                          className={cx(styles.item, styles.itemButton)}
                          title={collapsed ? label : undefined}
                          onClick={() => {
                            onCloseMobile();
                            if (item.action === 'reportBug') openBugReport();
                          }}
                        >
                          {content}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className={styles.footer}>
          <ConnectionIndicator compact={collapsed && !mobileOpen} />
          {canToggle && (
            <button
              type="button"
              className={styles.collapseToggle}
              onClick={onToggleCollapsed}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!collapsed}
              aria-controls="app-sidebar"
            >
              {collapsed ? <ExpandIcon size={16} /> : <CollapseIcon size={16} />}
              <span className={styles.itemLabel}>Collapse</span>
            </button>
          )}
          <Link className={styles.version} to={ROUTES.helpReleases} title={`NekkoGuard release ${config.appVersion} — release notes`}>
            {collapsed && !mobileOpen ? `v${config.appVersion}` : `NekkoGuard v${config.appVersion}`}
          </Link>
        </div>
      </aside>
    </>
  );
}
