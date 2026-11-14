import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronDown, LogOut, ShieldCheck, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router';
import { ROUTES } from '@/app/routes';
import { Avatar } from '@/components/Avatar/Avatar';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import { useCurrentUser } from '@/features/account/hooks/useCurrentUser';
import { useAuth } from '@/features/auth/useAuth';
import styles from './TopBar.module.css';

export function UserMenu() {
  const { user: sessionUser, signOut } = useAuth();
  const { data: user, isPending } = useCurrentUser();
  const navigate = useNavigate();

  const email = user?.email ?? sessionUser?.email ?? '';
  const name = user?.name ?? '';
  const displayName = name || email;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className={styles.userTrigger} aria-label="Account menu">
        <Avatar name={name} email={email} size={28} />
        <span className={styles.userText}>
          {isPending ? <Skeleton width={96} height={12} /> : <span className={styles.userName}>{displayName}</span>}
        </span>
        <ChevronDown size={14} className={styles.chevron} aria-hidden="true" />
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles.menu} align="end" sideOffset={8}>
          <div className={styles.menuHeader}>
            <Avatar name={name} email={email} size={32} />
            <div className={styles.menuIdentity}>
              <span className={styles.menuName}>{name || 'No display name'}</span>
              <span className={styles.menuEmail}>{email}</span>
            </div>
          </div>
          <DropdownMenu.Separator className={styles.menuSeparator} />
          <DropdownMenu.Item className={styles.menuItem} onSelect={() => navigate(ROUTES.profile)}>
            <UserRound size={16} /> Profile
          </DropdownMenu.Item>
          <DropdownMenu.Item className={styles.menuItem} onSelect={() => navigate(ROUTES.security)}>
            <ShieldCheck size={16} /> Security
          </DropdownMenu.Item>
          <DropdownMenu.Separator className={styles.menuSeparator} />
          <DropdownMenu.Item className={`${styles.menuItem} ${styles.menuDanger}`} onSelect={() => void signOut()}>
            <LogOut size={16} /> Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
