import { useQuery } from '@tanstack/react-query';
import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { queryKeys } from '@/api/queryKeys';
import { termsApi, type TenantTermsDto } from '@/api/terms';
import { ErrorState } from '@/components/ErrorState/ErrorState';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import { useTenancy } from '@/features/tenancy/hooks';
import { PageHeader } from '@/layout/PageHeader/PageHeader';
import { cx } from '@/lib/cx';
import { tenantAcceptanceSource } from '../acceptanceSources';
import { AcceptancePanel } from '../components/AcceptancePanel';
import { CurrentTermsPanel } from '../components/CurrentTermsPanel';
import { DraftPanel } from '../components/DraftPanel';
import { HistoryPanel, type VersionLoader } from '../components/HistoryPanel';
import styles from '../components/Terms.module.css';
import { useTenantTerms, useTermsVersions } from '../hooks';

type Tab = 'current' | 'draft' | 'history' | 'acceptance';
const LABELS: Record<Tab, string> = { current: 'Current', draft: 'Draft', history: 'History', acceptance: 'Acceptance' };

/** WAI-ARIA tabs: arrow keys move between tabs, one tab panel. */
function Tabs({ tabs, active, onChange, marker }: { tabs: Tab[]; active: Tab; onChange: (tab: Tab) => void; marker?: Tab }) {
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const index = tabs.indexOf(active);
    const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    if (next) {
      onChange(next);
      document.getElementById(`terms-tab-${next}`)?.focus();
    }
  }
  return (
    <div className={styles.tabs} role="tablist" aria-label="Terms of Service" onKeyDown={onKeyDown}>
      {tabs.map((tab) => (
        <button
          key={tab}
          id={`terms-tab-${tab}`}
          type="button"
          role="tab"
          aria-selected={active === tab}
          aria-controls="terms-tabpanel"
          tabIndex={active === tab ? 0 : -1}
          className={cx(styles.tab, active === tab && styles.tabActive)}
          onClick={() => onChange(tab)}
        >
          {LABELS[tab]}
          {tab === marker && <span className={styles.dotBadge} aria-label="(draft in progress)" />}
        </button>
      ))}
    </div>
  );
}

function TabPanel({ tab, children }: { tab: Tab; children: ReactNode }) {
  return (
    <div id="terms-tabpanel" role="tabpanel" aria-labelledby={`terms-tab-${tab}`}>
      {children}
    </div>
  );
}

/** Tenant administrators: write, publish and audit. */
function AdminTerms({ tenantId, tenantName, terms }: { tenantId: string; tenantName: string; terms: TenantTermsDto }) {
  const versions = useTermsVersions(tenantId);
  const [tab, setTab] = useState<Tab>('current');
  const [acceptanceVersion, setAcceptanceVersion] = useState<number | null>(null);

  if (versions.isPending) return <Skeleton height={320} radius="sm" />;
  if (versions.isError) return <ErrorState error={versions.error} onRetry={() => void versions.refetch()} />;
  const hasDraft = versions.data.versions.some((v) => v.status === 'draft');
  const loader: VersionLoader = {
    queryKey: (id) => queryKeys.termsVersion(tenantId, id),
    fetch: (id, signal) => termsApi.version(tenantId, id, signal),
  };

  return (
    <>
      <Tabs tabs={['current', 'draft', 'history', 'acceptance']} active={tab} onChange={setTab} marker={hasDraft ? 'draft' : undefined} />
      <TabPanel tab={tab}>
        {tab === 'current' && <CurrentTermsPanel terms={terms} tenantName={tenantName} onWriteFirst={() => setTab('draft')} />}
        {tab === 'draft' && <DraftPanel tenantId={tenantId} tenantName={tenantName} versions={versions.data} />}
        {tab === 'history' && (
          <HistoryPanel
            tenantName={tenantName}
            versions={versions.data.versions}
            loader={loader}
            onShowAcceptances={(n) => {
              setAcceptanceVersion(n); // the Acceptance tab opens filtered on this version
              setTab('acceptance');
            }}
          />
        )}
        {tab === 'acceptance' && (
          <AcceptancePanel
            owner={tenantName}
            stats={versions.data.current_stats}
            versionNumbers={versions.data.versions.flatMap((v) => (v.number ? [v.number] : []))}
            source={tenantAcceptanceSource(tenantId)}
            version={acceptanceVersion}
            onVersionChange={setAcceptanceVersion}
          />
        )}
      </TabPanel>
    </>
  );
}

function MemberHistory({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const history = useQuery({ queryKey: queryKeys.termsHistory(tenantId), queryFn: ({ signal }) => termsApi.history(tenantId, signal) });
  if (history.isPending) return <Skeleton height={200} radius="sm" />;
  if (history.isError) return <ErrorState error={history.error} onRetry={() => void history.refetch()} />;
  return (
    <HistoryPanel
      tenantName={tenantName}
      versions={history.data}
      loader={{
        queryKey: (id) => queryKeys.termsHistoryVersion(tenantId, id),
        fetch: (id, signal) => termsApi.historyVersion(tenantId, id, signal),
      }}
    />
  );
}

/** Members: the current version and the published history, read-only. */
function MemberTerms({ tenantId, tenantName, terms }: { tenantId: string; tenantName: string; terms: TenantTermsDto }) {
  const [tab, setTab] = useState<Tab>('current');
  return (
    <>
      <Tabs tabs={['current', 'history']} active={tab} onChange={setTab} />
      <TabPanel tab={tab}>
        {tab === 'current' ? <CurrentTermsPanel terms={terms} tenantName={tenantName} /> : <MemberHistory tenantId={tenantId} tenantName={tenantName} />}
      </TabPanel>
    </>
  );
}

function TenantTerms({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const terms = useTenantTerms(tenantId);
  if (terms.isPending) return <Skeleton height={320} radius="sm" />;
  if (terms.isError) return <ErrorState error={terms.error} onRetry={() => void terms.refetch()} retrying={terms.isFetching} />;
  return terms.data.can_manage ? (
    <AdminTerms tenantId={tenantId} tenantName={tenantName} terms={terms.data} />
  ) : (
    <MemberTerms tenantId={tenantId} tenantName={tenantName} terms={terms.data} />
  );
}

/**
 * Software › Terms of service: the selected Tenant's Terms. Members read the current
 * version and the history; Tenant administrators also write, publish and audit.
 */
export function TermsPage() {
  const { currentTenant } = useTenancy();
  return (
    <div className={styles.page}>
      <PageHeader
        title="Terms of Service"
        description={currentTenant ? `The terms that apply to everyone in ${currentTenant.name}.` : 'The terms that apply to your use of NekkoGuard.'}
      />
      {currentTenant ? (
        <TenantTerms key={currentTenant.id} tenantId={currentTenant.id} tenantName={currentTenant.name} />
      ) : (
        <p className={styles.muted}>Open an organization to see the Terms of Service of its tenant.</p>
      )}
    </div>
  );
}
