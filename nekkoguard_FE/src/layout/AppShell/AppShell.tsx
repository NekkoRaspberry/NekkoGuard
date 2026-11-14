import { useState } from 'react';
import { Outlet } from 'react-router';
import { isApiError } from '@/api/errors';
import { Banner } from '@/components/Banner/Banner';
import { Button } from '@/components/Button/Button';
import { useCurrentUser } from '@/features/account/hooks/useCurrentUser';
import { ReauthProvider } from '@/features/auth/reauth/ReauthProvider';
import { RealtimeProvider } from '@/features/system/RealtimeProvider';
import { useLocalStorageBoolean } from '@/hooks/useLocalStorageState';
import { Sidebar } from '../Sidebar/Sidebar';
import { TopBar } from '../TopBar/TopBar';
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

export function AppShell() {
  const [collapsed, setCollapsed] = useLocalStorageBoolean('nekkoguard.sidebar.collapsed', false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <RealtimeProvider>
      <ReauthProvider>
      <a href="#main-content" className={styles.skipLink}>
        Skip to content
      </a>
      <div className={styles.shell}>
        <Sidebar
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed(!collapsed)}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
        />
        <div className={styles.main}>
          <TopBar onOpenNavigation={() => setMobileOpen(true)} />
          <main id="main-content" className={styles.content} tabIndex={-1}>
            <ServerUnreachableBanner />
            <Outlet />
          </main>
        </div>
      </div>
      </ReauthProvider>
    </RealtimeProvider>
  );
}
