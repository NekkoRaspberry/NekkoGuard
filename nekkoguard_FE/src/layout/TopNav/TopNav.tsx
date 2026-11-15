import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronDown } from 'lucide-react';
import { useRef } from 'react';
import { Link, matchPath, NavLink, useLocation } from 'react-router';
import { ROUTES } from '@/app/routes';
import { Logo } from '@/components/Logo/Logo';
import { useEffectiveAppearance } from '@/features/appearance/hooks';
import { useBugReport } from '@/features/help/useBugReport';
import { cx } from '@/lib/cx';
import { isLinkItem, navItemKey, type NavItem } from '../navigation';
import { useNavigation } from '../useNavigation';
import styles from './TopNav.module.css';

const isItemActive = (item: NavItem, pathname: string) =>
  isLinkItem(item) && matchPath({ path: item.to, end: item.end ?? false }, pathname) !== null;

/**
 * Horizontal navigation for the white-label "top" position (desktop only; on smaller
 * screens the sidebar drawer is used for every position). Same items, permissions and
 * active-route rules as the sidebar: each group (Infrastructure, Settings) is a
 * dropdown; Overview stays a direct link.
 */
export function TopNav() {
  const navigation = useNavigation();
  const { pathname } = useLocation();
  const { title, logoUrl } = useEffectiveAppearance();
  const { openBugReport } = useBugReport();
  // Dialogs open only once the menu has closed (it would take the focus back).
  const reportAfterClose = useRef(false);

  return (
    <nav className={styles.topnav} aria-label="Main navigation">
      <Link to={ROUTES.overview} className={styles.brand} aria-label={`${title ?? 'NekkoGuard'} home`}>
        <Logo size={28} imageSrc={logoUrl} title={title} />
      </Link>
      <ul className={styles.list}>
        {navigation.map((group) => {
          const [only] = group.items;
          if (group.items.length === 1 && only && isLinkItem(only) && only.to === ROUTES.overview) {
            const Icon = only.icon;
            return (
              <li key={group.label}>
                <NavLink
                  to={only.to}
                  end={only.end ?? false}
                  className={({ isActive }) => cx(styles.item, isActive && styles.active)}
                >
                  <Icon size={16} aria-hidden="true" />
                  {only.label}
                </NavLink>
              </li>
            );
          }
          const groupActive = group.items.some((item) => isItemActive(item, pathname));
          return (
            <li key={group.label}>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger className={cx(styles.item, groupActive && styles.active)}>
                  {group.label}
                  <ChevronDown size={14} className={styles.chevron} aria-hidden="true" />
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    className={styles.menu}
                    align="start"
                    sideOffset={6}
                    onCloseAutoFocus={(event) => {
                      if (!reportAfterClose.current) return;
                      reportAfterClose.current = false;
                      event.preventDefault();
                      openBugReport();
                    }}
                  >
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      if (!isLinkItem(item)) {
                        return (
                          <DropdownMenu.Item
                            key={navItemKey(item)}
                            className={styles.menuItem}
                            onSelect={() => {
                              if (item.action === 'reportBug') reportAfterClose.current = true;
                            }}
                          >
                            <Icon size={16} className={styles.menuIcon} aria-hidden="true" />
                            <span className={styles.menuLabel}>{item.label}</span>
                          </DropdownMenu.Item>
                        );
                      }
                      return (
                        // asChild merges classNames as strings: NavLink's className callback
                        // would end up as text, so the active state is computed here.
                        <DropdownMenu.Item key={navItemKey(item)} asChild>
                          <Link
                            to={item.to}
                            className={cx(styles.menuItem, isItemActive(item, pathname) && styles.menuItemActive)}
                            aria-current={isItemActive(item, pathname) ? 'page' : undefined}
                          >
                            <Icon size={16} className={styles.menuIcon} aria-hidden="true" />
                            <span className={styles.menuLabel}>{item.label}</span>
                          </Link>
                        </DropdownMenu.Item>
                      );
                    })}
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
