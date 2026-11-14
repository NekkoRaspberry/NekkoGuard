import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Building2, Check, ChevronDown, Layers, MapPin, Network } from 'lucide-react';
import type { ReactNode } from 'react';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import { useTenancy } from '../hooks';
import type { Level } from '../selection';
import styles from './ContextBar.module.css';

interface Option {
  id: string;
  name: string;
  hint?: string;
}

interface SelectorProps {
  level: Level;
  label: string;
  icon: ReactNode;
  value: string | null;
  options: Option[];
  /** Offer an "All …" entry (optional filters only). */
  allLabel?: string;
  onSelect: (level: Level, id: string | null) => void;
}

function Selector({ level, label, icon, value, options, allLabel, onSelect }: SelectorProps) {
  const current = options.find((option) => option.id === value);
  const text = current?.name ?? allLabel ?? '—';
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className={styles.trigger} aria-label={`${label}: ${text}`}>
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
        <span className={styles.value}>{text}</span>
        <ChevronDown size={13} className={styles.chevron} aria-hidden="true" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles.menu} align="start" sideOffset={6}>
          <DropdownMenu.Label className={styles.menuLabel}>{label}</DropdownMenu.Label>
          {allLabel && (
            <DropdownMenu.Item className={styles.item} onSelect={() => onSelect(level, null)}>
              <span className={styles.check}>{value === null && <Check size={14} />}</span>
              {allLabel}
            </DropdownMenu.Item>
          )}
          {options.map((option) => (
            <DropdownMenu.Item key={option.id} className={styles.item} onSelect={() => onSelect(level, option.id)}>
              <span className={styles.check}>{option.id === value && <Check size={14} />}</span>
              <span className={styles.itemText}>
                <span className={styles.itemName}>{option.name}</span>
                {option.hint && <span className={styles.itemHint}>{option.hint}</span>}
              </span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function Separator() {
  return (
    <span className={styles.separator} aria-hidden="true">
      /
    </span>
  );
}

/**
 * Tenant / Organization / Site / Network selectors. Only levels the user can access
 * are shown; options come from the backend's lists for this user.
 */
export function ContextBar() {
  const { tenants, tenantsError, organizations, sites, networks, selection, select } = useTenancy();

  if (tenantsError) return <span className={styles.muted}>Context unavailable</span>;
  if (!tenants) return <Skeleton width={180} height={14} />;
  if (tenants.length === 0) return <span className={styles.muted}>No tenant access yet</span>;

  const tenantOptions = tenants.map((t) => ({
    id: t.id,
    name: t.name,
    hint: t.role ? undefined : 'Organization access only',
  }));
  const visibleNetworks = networks?.filter((n) => selection.site === null || n.site === selection.site);

  return (
    <nav className={styles.bar} aria-label="Current context">
      <Selector
        level="tenant"
        label="Tenant"
        icon={<Layers size={14} />}
        value={selection.tenant}
        options={tenantOptions}
        onSelect={select}
      />
      {selection.tenant && (
        <>
          <Separator />
          {organizations === undefined ? (
            <Skeleton width={90} height={14} />
          ) : organizations.length === 0 ? (
            <span className={styles.muted}>No organization access</span>
          ) : (
            <Selector
              level="org"
              label="Organization"
              icon={<Building2 size={14} />}
              value={selection.org}
              options={organizations.map((o) => ({ id: o.id, name: o.name }))}
              onSelect={select}
            />
          )}
        </>
      )}
      {selection.org && sites && sites.length > 0 && (
        <span className={styles.optionalGroup}>
          <Separator />
          <Selector
            level="site"
            label="Site"
            icon={<MapPin size={14} />}
            value={selection.site}
            options={sites.map((s) => ({ id: s.id, name: s.name }))}
            allLabel="All sites"
            onSelect={select}
          />
        </span>
      )}
      {selection.org && visibleNetworks && visibleNetworks.length > 0 && (
        <span className={styles.optionalGroup}>
          <Separator />
          <Selector
            level="network"
            label="Network"
            icon={<Network size={14} />}
            value={selection.network}
            options={visibleNetworks.map((n) => ({ id: n.id, name: n.name, hint: n.cidr || undefined }))}
            allLabel="All networks"
            onSelect={select}
          />
        </span>
      )}
    </nav>
  );
}
