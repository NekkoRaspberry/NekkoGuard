import { KeyRound } from 'lucide-react';
import type { EffectiveAccessDto } from '@/api/tenancy';
import { Card, CardBody, CardHeader } from '@/components/Card/Card';
import { StatusPill } from '@/components/StatusPill/StatusPill';
import { ORGANIZATION_ROLE_LABELS } from '@/features/tenancy/model';
import styles from '@/features/tenancy/components/Management.module.css';
import { DecisionTable } from './DecisionTable';

/** How the signed-in user reaches this Organization and what they may do in it. */
export function MyAccessCard({ access }: { access: EffectiveAccessDto | null }) {
  return (
    <Card aria-labelledby="my-access-title">
      <CardHeader
        icon={<KeyRound size={16} />}
        title="Your access"
        titleId="my-access-title"
        description="Resolved by the server from your memberships and any overrides."
      />
      <CardBody>
        {access === null ? (
          <p className={styles.explain}>
            You administer this organization from the tenant, but you do not reach its infrastructure.
          </p>
        ) : (
          <div className={styles.stack}>
            <div className={styles.chips}>
              {access.organization_role && (
                <StatusPill tone="info" label={`Direct: ${ORGANIZATION_ROLE_LABELS[access.organization_role]}`} />
              )}
              {access.inherited_role && (
                <StatusPill tone="neutral" label={`From tenant: ${ORGANIZATION_ROLE_LABELS[access.inherited_role]}`} />
              )}
            </div>
            <DecisionTable decisions={access.decisions} label="Your permissions" />
          </div>
        )}
      </CardBody>
    </Card>
  );
}
