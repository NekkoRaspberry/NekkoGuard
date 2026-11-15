import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Building2, Check, ChevronDown, Search } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import { useTenancy } from '../hooks';
import { groupOrganizations } from '../switcher';
import styles from './ContextBar.module.css';

/**
 * Organization switcher (the user always works inside one Organization).
 *
 * Lists every Organization the user can open, grouped by Tenant, with a search box on
 * the first row. Picking an Organization of another Tenant switches the Tenant too.
 */
export function ContextBar() {
  const { tenants, tenantsError, myOrganizations, myOrganizationsError, selection, selectOrganization } = useTenancy();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const search = useRef<HTMLInputElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // Radix focuses the menu itself when it opens; move focus to the search box after.
    const timer = window.setTimeout(() => search.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (tenantsError || myOrganizationsError) return <span className={styles.muted}>Context unavailable</span>;
  if (!tenants || !myOrganizations) return <Skeleton width={180} height={14} />;
  if (tenants.length === 0) return <span className={styles.muted}>No tenant access yet</span>;
  if (myOrganizations.length === 0) return <span className={styles.muted}>No organization access</span>;

  const current = myOrganizations.find((o) => o.id === selection.org);
  const groups = groupOrganizations(myOrganizations, query);
  const firstMatch = groups[0]?.organizations[0];

  const onSearchKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    } else if (event.key === 'Enter' && firstMatch) {
      event.preventDefault();
      selectOrganization(firstMatch.id);
      setOpen(false);
    }
    // Keep typing in the box: the menu's own type-ahead would steal these keys.
    if (event.key !== 'Escape' && event.key !== 'Tab') event.stopPropagation();
  };

  return (
    <DropdownMenu.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <DropdownMenu.Trigger
        className={styles.trigger}
        aria-label={`Organization: ${current?.name ?? 'none selected'}`}
        title={current ? `${current.tenant_name} / ${current.name}` : undefined}
      >
        <span className={styles.icon} aria-hidden="true">
          <Building2 size={14} />
        </span>
        <span className={styles.value}>{current?.name ?? 'Select an organization'}</span>
        <ChevronDown size={13} className={styles.chevron} aria-hidden="true" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content ref={menu} className={styles.menu} align="center" sideOffset={6}>
          <div className={styles.searchRow}>
            <Search size={14} className={styles.searchIcon} aria-hidden="true" />
            <input
              ref={search}
              type="search"
              className={styles.search}
              placeholder="Search organizations"
              aria-label="Search organizations"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onSearchKey}
            />
          </div>
          {groups.length === 0 && <p className={styles.empty}>No organizations match “{query.trim()}”.</p>}
          {groups.map((group) => (
            <DropdownMenu.Group key={group.tenantId} className={styles.group}>
              <DropdownMenu.Label className={styles.menuLabel}>{group.tenantName}</DropdownMenu.Label>
              {group.organizations.map((org) => (
                <DropdownMenu.Item key={org.id} className={styles.item} onSelect={() => selectOrganization(org.id)}>
                  <span className={styles.check}>{org.id === selection.org && <Check size={14} />}</span>
                  <span className={styles.itemName}>{org.name}</span>
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Group>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
