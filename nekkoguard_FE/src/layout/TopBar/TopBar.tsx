import { ChevronRight, Menu } from 'lucide-react';
import { Fragment } from 'react';
import { Link, useMatches } from 'react-router';
import { UserMenu } from './UserMenu';
import styles from './TopBar.module.css';

/** One breadcrumb: every crumb is a link, including the current page. */
export interface Crumb {
  label: string;
  to: string;
}

/** Route `handle` used to build the breadcrumb trail. */
export interface RouteHandle {
  crumbs: Crumb[];
}

function isRouteHandle(handle: unknown): handle is RouteHandle {
  return typeof handle === 'object' && handle !== null && Array.isArray((handle as RouteHandle).crumbs);
}

function useBreadcrumbs(): Crumb[] {
  const matches = useMatches();
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const handle = matches[i]?.handle;
    if (isRouteHandle(handle)) return handle.crumbs;
  }
  return [];
}

export function TopBar({ onOpenNavigation }: { onOpenNavigation: () => void }) {
  const crumbs = useBreadcrumbs();

  return (
    <header className={styles.topbar}>
      <div className={styles.left}>
        <button
          type="button"
          className={styles.menuButton}
          onClick={onOpenNavigation}
          aria-label="Open navigation"
          aria-controls="app-sidebar"
        >
          <Menu size={18} />
        </button>
        <nav aria-label="Breadcrumb">
          <ol className={styles.crumbs}>
            {crumbs.map((crumb, index) => {
              const isLast = index === crumbs.length - 1;
              return (
                <Fragment key={`${crumb.label}-${index}`}>
                  <li className={isLast ? styles.crumbCurrent : styles.crumb}>
                    <Link to={crumb.to} className={styles.crumbLink} aria-current={isLast ? 'page' : undefined}>
                      {crumb.label}
                    </Link>
                  </li>
                  {!isLast && (
                    <li className={styles.separator} aria-hidden="true">
                      <ChevronRight size={14} />
                    </li>
                  )}
                </Fragment>
              );
            })}
          </ol>
        </nav>
      </div>
      <UserMenu />
    </header>
  );
}
