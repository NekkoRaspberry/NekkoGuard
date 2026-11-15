import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { queryKeys } from '@/api/queryKeys';
import { termsApi, type AcceptanceSummaryDto } from '@/api/terms';
import { ROUTES } from '@/app/routes';
import { ButtonLink } from '@/components/Button/Button';
import { Card, CardBody, CardHeader } from '@/components/Card/Card';
import { ErrorState } from '@/components/ErrorState/ErrorState';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import { organizationCapabilities } from '@/features/settings/capabilities';
import { RequireOrganization, RequireTenant } from '@/features/tenancy/components/ScopeGate';
import { useCanTenant, useTenancy } from '@/features/tenancy/hooks';
import { TENANT_PERMISSIONS } from '@/features/tenancy/model';
import management from '@/features/tenancy/components/Management.module.css';
import { formatCalendarDate } from '@/lib/format';
import { organizationAcceptanceSource, tenantAcceptanceSource } from '../acceptanceSources';
import { AcceptancePanel, type AcceptanceSource } from '../components/AcceptancePanel';
import styles from '../components/Terms.module.css';

/** Which version is in effect, and a way to read it. */
function CurrentVersionCard({ summary }: { summary: AcceptanceSummaryDto }) {
  const current = summary.current;
  return (
    <Card aria-labelledby="terms-current-title">
      <CardHeader
        icon={<FileText size={16} />}
        title="Current Terms of Service"
        titleId="terms-current-title"
        description={
          current
            ? `Version ${current.number} of ${summary.tenant_name}, effective ${current.effective_date ? formatCalendarDate(current.effective_date) : '—'}${
                current.published_by ? ` · published by ${current.published_by.email}` : ''
              }.`
            : `No Terms of Service published for ${summary.tenant_name}: nobody is asked to accept anything yet.`
        }
        actions={
          <ButtonLink to={ROUTES.helpTerms} size="sm" variant="secondary">
            {current ? 'Read the Terms' : 'Open Terms of Service'}
          </ButtonLink>
        }
      />
      {current && (
        <CardBody>
          <p className={styles.muted}>A new version always needs a new acceptance: earlier acceptances stay in the records below.</p>
        </CardBody>
      )}
    </Card>
  );
}

function AcceptancePage({
  summary,
  owner,
  source,
  description,
}: {
  summary: UseQueryResult<AcceptanceSummaryDto>;
  owner: string;
  source: AcceptanceSource;
  description: string;
}) {
  if (summary.isPending) return <Skeleton height={240} radius="sm" />;
  if (summary.isError) return <ErrorState error={summary.error} onRetry={() => void summary.refetch()} retrying={summary.isFetching} />;
  return (
    <>
      <CurrentVersionCard summary={summary.data} />
      <AcceptancePanel
        owner={owner}
        stats={summary.data.current_stats}
        versionNumbers={summary.data.version_numbers}
        source={source}
        description={description}
      />
    </>
  );
}

function TenantAcceptance({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const summary = useQuery({ queryKey: queryKeys.termsSummary(tenantId), queryFn: ({ signal }) => termsApi.tenantSummary(tenantId, signal) });
  return (
    <AcceptancePage
      summary={summary}
      owner={tenantName}
      source={tenantAcceptanceSource(tenantId)}
      description={`Everyone in ${tenantName}. Superusers, suspended members and inactive accounts are not required to accept. Records are permanent.`}
    />
  );
}

/** Settings › Tenant › Terms of Service: acceptance by everyone in the Tenant. */
export function TenantTermsAcceptancePage() {
  const canManage = useCanTenant(TENANT_PERMISSIONS.manage);
  return (
    <div className={management.stack}>
      <RequireTenant>
        {({ tenantId, tenant }) =>
          canManage ? (
            <TenantAcceptance key={tenantId} tenantId={tenantId} tenantName={tenant.name} />
          ) : (
            <p className={management.muted}>You have no permission to see the Terms of Service acceptance of {tenant.name}.</p>
          )
        }
      </RequireTenant>
    </div>
  );
}

function OrganizationAcceptance({ tenantId, orgId, organizationName }: { tenantId: string; orgId: string; organizationName: string }) {
  const summary = useQuery({
    queryKey: queryKeys.organizationTermsSummary(tenantId, orgId),
    queryFn: ({ signal }) => termsApi.organizationSummary(tenantId, orgId, signal),
  });
  return (
    <AcceptancePage
      summary={summary}
      owner={organizationName}
      source={organizationAcceptanceSource(tenantId, orgId)}
      description={`People of ${organizationName}: its direct members and the tenant members who reach it. Records are permanent.`}
    />
  );
}

/** Settings › Organization › Terms of Service: the Tenant's Terms, for this organization's people. */
export function OrganizationTermsAcceptancePage() {
  const { tenantPermissions } = useTenancy();
  return (
    <div className={management.stack}>
      <RequireOrganization>
        {(scope) =>
          organizationCapabilities(scope.organization, tenantPermissions).canViewAccess ? (
            <OrganizationAcceptance key={scope.orgId} tenantId={scope.tenantId} orgId={scope.orgId} organizationName={scope.organization.name} />
          ) : (
            <p className={management.muted}>You have no permission to view the members of this organization.</p>
          )
        }
      </RequireOrganization>
    </div>
  );
}
