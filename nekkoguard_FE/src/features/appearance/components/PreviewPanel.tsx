import { Building2, ChevronDown } from 'lucide-react';
import type { CSSProperties } from 'react';
import { Button } from '@/components/Button/Button';
import { LogoMark } from '@/components/Logo/Logo';
import { StatusPill } from '@/components/StatusPill/StatusPill';
import { useCurrentUser } from '@/features/account/hooks/useCurrentUser';
import { useTenancy } from '@/features/tenancy/hooks';
import { cx } from '@/lib/cx';
import { initialsFor } from '@/lib/format';
import type { previewOf } from '../draft';
import { DEFAULT_TITLE, isolatedThemeVariables } from '../theme';
import styles from './Appearance.module.css';

/**
 * A miniature app styled with the *unsaved* draft. The CSS variables are set on this
 * element only, so nothing else on the page changes until the draft is saved. All of
 * them are set (defaults included) so the page's own theme never leaks in.
 */
export function PreviewPanel({ preview, orgId = null }: { preview: ReturnType<typeof previewOf>; orgId?: string | null }) {
  const style = isolatedThemeVariables(preview.overrides) as CSSProperties;
  const position = preview.navbarPosition;
  const { organizations, currentOrganization } = useTenancy();
  const user = useCurrentUser().data;
  // The organization being customized, else the selected one (tenant appearance).
  const organizationName =
    (orgId ? organizations?.find((o) => o.id === orgId)?.name : null) ?? currentOrganization?.name ?? 'Organization';
  const userName = user?.name || user?.email || 'You';

  return (
    <div
      className={cx(styles.preview, position === 'top' && styles.previewTop, position === 'right' && styles.previewRight)}
      style={style}
      data-testid="appearance-preview"
      data-nav-position={position}
      aria-hidden="true"
      inert
    >
      <div className={styles.previewNav}>
        <div className={styles.previewBrand}>
          {preview.logoUrl ? <img src={preview.logoUrl} alt="" /> : <LogoMark size={20} />}
          <span>{preview.title ?? DEFAULT_TITLE}</span>
        </div>
        <span className={cx(styles.previewItem, styles.previewItemActive)}>Overview</span>
        <span className={styles.previewItem}>Sites</span>
        <span className={styles.previewItem}>Settings</span>
      </div>
      <div className={styles.previewMain}>
        {/* Second bar of the app: page, organization switcher, profile. */}
        <div className={styles.previewTopbar}>
          <span className={styles.previewCrumb}>Overview</span>
          <span className={styles.previewSwitcher}>
            <Building2 size={11} aria-hidden="true" />
            <span>{organizationName}</span>
            <ChevronDown size={11} aria-hidden="true" />
          </span>
          <span className={styles.previewProfile}>
            <span className={styles.previewAvatar}>{initialsFor(user?.name ?? '', user?.email ?? '')}</span>
            <span className={styles.previewUser}>{userName}</span>
          </span>
        </div>
        <div className={styles.previewContent}>
          <div className={styles.previewCard}>
            <span className={styles.previewHeading}>Network status</span>
            <span>All sites are reachable.</span>
            <span className={styles.previewMuted}>Updated a minute ago</span>
            <span className={styles.previewAccent}>View details</span>
          </div>
          <div className={styles.previewRow}>
            <Button size="sm" tabIndex={-1}>
              Primary
            </Button>
            <Button size="sm" variant="secondary" tabIndex={-1}>
              Secondary
            </Button>
          </div>
          <div className={styles.previewRow}>
            <StatusPill tone="success" label="Online" />
            <StatusPill tone="warning" label="Degraded" />
            <StatusPill tone="danger" label="Offline" />
  </div>
        </div>
      </div>
    </div>
  );
}
