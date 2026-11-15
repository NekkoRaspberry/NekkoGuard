import { Banner } from '@/components/Banner/Banner';
import { useCurrentUser } from '@/features/account/hooks/useCurrentUser';
import { MfaAction } from './MfaAction';

/**
 * Shown instead of an administrative page while the session has not passed MFA. The
 * page itself is not rendered, so none of its data is requested.
 */
export function AdminAccessUnavailable() {
  const mfaEnabled = useCurrentUser().data?.mfaEnabled === true;
  return (
    <Banner tone="warning" title="Administrative access unavailable" action={<MfaAction />}>
      {mfaEnabled
        ? 'Two-factor authentication is required to access this administrative functionality. This session signed in without it: confirm with a code from your authenticator app to continue.'
        : 'Two-factor authentication is required to access this administrative functionality. Activate MFA in Profile › Security to continue.'}
    </Banner>
  );
}
