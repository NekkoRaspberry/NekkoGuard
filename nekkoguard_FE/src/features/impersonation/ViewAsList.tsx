import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useQuery } from '@tanstack/react-query';
import { Search, Undo2 } from 'lucide-react';
import { useDeferredValue, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { impersonationApi, type ImpersonationStatusDto } from '@/api/impersonation';
import { queryKeys } from '@/api/queryKeys';
import { Avatar } from '@/components/Avatar/Avatar';
import { Spinner } from '@/components/Spinner/Spinner';
import styles from '@/layout/TopBar/TopBar.module.css';
import { useStartImpersonation, useStopImpersonation } from './useImpersonation';

/**
 * Content of the "view as" submenu (superusers only): search an active user and see
 * the whole app as them (read-only). The backend enforces every rule again.
 */
export function ViewAsList({ status }: { status: ImpersonationStatusDto }) {
  const [query, setQuery] = useState('');
  const search = useDeferredValue(query.trim());
  const input = useRef<HTMLInputElement>(null);
  const start = useStartImpersonation();
  const stop = useStopImpersonation();

  const users = useQuery({
    queryKey: queryKeys.impersonationUsers(search),
    queryFn: ({ signal }) => impersonationApi.users(search, signal),
    staleTime: 30_000,
  });

  useEffect(() => {
    // Radix focuses the submenu itself when it opens; move focus to the search box.
    const timer = window.setTimeout(() => input.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  // Keep typing in the box: the menu's own type-ahead would steal these keys.
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Escape' && event.key !== 'Tab' && event.key !== 'ArrowDown') event.stopPropagation();
  };

  const busy = start.isPending || stop.isPending;
  const viewing = status.active ? status.user : null;

  return (
    <>
      <DropdownMenu.Label className={styles.menuLabel}>View NekkoGuard as</DropdownMenu.Label>
      {viewing && status.real_user && (
        <DropdownMenu.Item className={styles.menuItem} disabled={busy} onSelect={() => stop.mutate()}>
          <Undo2 size={16} /> Back to my account ({status.real_user.email})
        </DropdownMenu.Item>
      )}
      <div className={styles.searchRow}>
        <Search size={14} className={styles.searchIcon} aria-hidden="true" />
        <input
          ref={input}
          type="search"
          className={styles.search}
          placeholder="Search users by name or email"
          aria-label="Search users"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
        />
      </div>
      <div className={styles.userList}>
        {users.isPending ? (
          <p className={styles.menuNote}>
            <Spinner size={16} /> Searching…
          </p>
        ) : users.isError ? (
          <p className={styles.menuNote}>Could not load users.</p>
        ) : users.data.length === 0 ? (
          <p className={styles.menuNote}>No users match “{search}”.</p>
        ) : (
          users.data.map((user) => (
            <DropdownMenu.Item
              key={user.id}
              className={styles.userOption}
              disabled={busy || user.id === viewing?.id}
              onSelect={() => start.mutate(user.id)}
            >
              <Avatar name={user.name} email={user.email} size={28} />
              <span className={styles.menuIdentity}>
                <span className={styles.menuName}>{user.name || user.email}</span>
                {user.name && <span className={styles.menuEmail}>{user.email}</span>}
              </span>
            </DropdownMenu.Item>
          ))
        )}
      </div>
      <p className={styles.menuHint}>Read-only: changes are disabled while viewing as someone else.</p>
    </>
  );
}
