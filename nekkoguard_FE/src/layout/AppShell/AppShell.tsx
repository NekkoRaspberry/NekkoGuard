import { useState } from 'react';
import { Outlet } from 'react-router';
import { isApiError } from '@/api/errors';
import { Banner } from '@/components/Banner/Banner';
import { Button } from '@/components/Button/Button';
import { useCurrentUser } from '@/features/account/hooks/useCurrentUser';
import { ReauthProvider } from '@/features/auth/reauth/ReauthProvider';
import { RealtimeProvider } from '@/features/system/RealtimeProvider';
import { TenancyProvider } from '@/features/tenancy/TenancyProvider';
import { AppearanceProvider } from '@/features/appearance/AppearanceProvider';
import { useEffectiveAppearance } from '@/features/appearance/hooks';
import { BugReportProvider } from '@/features/help/BugReportProvider';
import { TermsGate } from '@/features/terms/TermsGate';
import { MfaRequiredListener } from '@/features/account/mfa/MfaRequiredListener';
import { ImpersonationBanner } from '@/features/impersonation/ImpersonationBanner';
import { cx } from '@/lib/cx';
import { useLocalStorageBoolean } from '@/hooks/useLocalStorageState';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { RAIL_LAYOUT_QUERY, WIDE_LAYOUT_QUERY } from '../breakpoints';
import { Sidebar } from '../Sidebar/Sidebar';
import { TopBar } from '../TopBar/TopBar';
import { TopNav } from '../TopNav/TopNav';
import styles from './AppShell.module.css';

function ServerUnreachableBanner() {
  const { error, refetch, isFetching } = useCurrentUser();
  if (!isApiError(error) || !error.isUnreachable) return null;

  return (
    <Banner
      tone="danger"
      title="Cannot reach the NekkoGuard server"
      action={
        <Button size="sm" variant="secondary" onClick={() => void refetch()} loading={isFetching}>
          Retry
        </Button>
      }
      className={styles.banner}
    >
      Data shown may be out of date. Check that the backend is running.
    </Banner>
  );
}

/**
 * Sidebar + main area. The navigation position comes from the white-label appearance:
 * `left` (default, also when nothing is configured) renders the original layout.
 *
 * Three states (see layout/breakpoints.ts): wide screens use the user's choice
 * (expanded or collapsed); medium screens force the icon rail without changing
 * that saved choice; phones use the drawer.
 */
export function ShellFrame() {
  const [collapsedByUser, setCollapsedByUser] = useLocalStorageBoolean('nekkoguard.sidebar.collapsed', false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { navbarPosition } = useEffectiveAppearance();
  const wide = useMediaQuery(WIDE_LAYOUT_QUERY, true);
  const roomForRail = useMediaQuery(RAIL_LAYOUT_QUERY, true);
  // Phones: the drawer always shows labels. Medium: forced rail. Wide: the user's choice
  // (the top navigation position has no sidebar on wide screens).
  const collapsed = !roomForRail ? false : !wide ? true : navbarPosition !== 'top' && collapsedByUser;

  // Leaving the phone layout closes the drawer, so it is not open on the next resize.
  const [hadRoomForRail, setHadRoomForRail] = useState(roomForRail);
  if (hadRoomForRail !== roomForRail) {
    setHadRoomForRail(roomForRail);
    if (roomForRail) setMobileOpen(false);
  }

  return (
    <div
      className={cx(styles.shell, navbarPosition === 'right' && styles.navRight)}
      data-nav-position={navbarPosition === 'left' ? undefined : navbarPosition}
    >
      <Sidebar
        collapsed={collapsed}
        canToggle={wide}
        onToggleCollapsed={() => setCollapsedByUser(!collapsedByUser)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        placement={navbarPosition}
      />
      <div className={styles.main}>
        {navbarPosition === 'top' && wide && <TopNav />}
        <TopBar onOpenNavigation={() => setMobileOpen(true)} />
        <main id="main-content" className={styles.content} tabIndex={-1}>
          <ServerUnreachableBanner />
          <ImpersonationBanner className={styles.banner} />
          <MfaRequiredListener />
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function AppShell() {
  return (
    <TermsGate>
    <RealtimeProvider>
      <TenancyProvider>
      <AppearanceProvider>
      <ReauthProvider>
      <a href="#main-content" className={styles.skipLink}>
        Skip to content
      </a>
      <BugReportProvider>
        <ShellFrame />
      </BugReportProvider>
      </ReauthProvider>
      </AppearanceProvider>
      </TenancyProvider>
    </RealtimeProvider>
    </TermsGate>
  );
}
