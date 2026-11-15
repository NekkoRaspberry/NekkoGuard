import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronDown, ChevronRight, Eye, LogOut, Undo2, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router';
import { ROUTES } from '@/app/routes';
import { Avatar } from '@/components/Avatar/Avatar';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import { useCurrentUser } from '@/features/account/hooks/useCurrentUser';
import { useAuth } from '@/features/auth/useAuth';
import { useImpersonation, useStopImpersonation } from '@/features/impersonation/useImpersonation';
import { ViewAsList } from '@/features/impersonation/ViewAsList';
import { cx } from '@/lib/cx';
import styles from './TopBar.module.css';

export function UserMenu() {
  const { user: sessionUser, signOut } = useAuth();
  // While "viewing as", the API answers as the viewed user: this is them.
  const { data: user, isPending } = useCurrentUser();
  const impersonation = useImpersonation().data;
  const stop = useStopImpersonation();
  const navigate = useNavigate();

  const email = user?.email ?? sessionUser?.email ?? '';
  const name = user?.name ?? '';
  const displayName = name || email;
  const viewing = impersonation?.active === true;

  const identity = (
    <>
      <Avatar name={name} email={email} size={32} />
      <div className={styles.menuIdentity}>
        {viewing && <span className={styles.viewingLabel}>Viewing as</span>}
        <span className={styles.menuName}>{name || 'No display name'}</span>
        <span className={styles.menuEmail}>{email}</span>
      </div>
    </>
  );

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className={cx(styles.userTrigger, viewing && styles.userTriggerViewing)}
        aria-label={viewing ? `Account menu (viewing as ${displayName})` : 'Account menu'}
      >
        {viewing && <Eye size={16} className={styles.viewingIcon} aria-hidden="true" />}
        <Avatar name={name} email={email} size={28} />
        <span className={styles.userText}>
          {isPending ? <Skeleton width={96} height={12} /> : <span className={styles.userName}>{displayName}</span>}
        </span>
        <ChevronDown size={14} className={styles.chevron} aria-hidden="true" />
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles.menu} align="end" sideOffset={8}>
          {impersonation?.available ? (
            // Superusers: the name opens the "view as user" switcher.
            <DropdownMenu.Sub>
              <DropdownMenu.SubTrigger className={cx(styles.menuHeader, styles.menuHeaderSwitch)} aria-label="View as another user">
                {identity}
                <ChevronRight size={14} className={styles.subChevron} aria-hidden="true" />
              </DropdownMenu.SubTrigger>
              <DropdownMenu.Portal>
                <DropdownMenu.SubContent className={cx(styles.menu, styles.viewAsMenu)} sideOffset={6} collisionPadding={8}>
                  <ViewAsList status={impersonation} />
                </DropdownMenu.SubContent>
              </DropdownMenu.Portal>
            </DropdownMenu.Sub>
          ) : (
            <div className={styles.menuHeader}>{identity}</div>
          )}
          <DropdownMenu.Separator className={styles.menuSeparator} />
          {viewing ? (
            <DropdownMenu.Item className={styles.menuItem} disabled={stop.isPending} onSelect={() => stop.mutate()}>
              <Undo2 size={16} /> Back to my account
            </DropdownMenu.Item>
          ) : (
            // Settings → Profile (Personal information, Security, Connected applications).
            <DropdownMenu.Item className={styles.menuItem} onSelect={() => navigate(ROUTES.profile)}>
              <UserRound size={16} /> Profile
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Separator className={styles.menuSeparator} />
          <DropdownMenu.Item className={`${styles.menuItem} ${styles.menuDanger}`} onSelect={() => void signOut()}>
            <LogOut size={16} /> Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
