import { useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { useContext, useState } from 'react';
import { Button, ButtonLink } from '@/components/Button/Button';
import { useCurrentUser } from '@/features/account/hooks/useCurrentUser';
import { isReauthCancelled, ReauthContext } from '@/features/auth/reauth/ReauthContext';
import { MFA_SETUP_URL } from './mfa';

/**
 * What unlocks Tenant administration for this user:
 * - no authenticator app yet → link to Profile › Security to set it up;
 * - app set up, but this session signed in without it → enter a code now (the
 *   backend then counts this session as having passed MFA) and reload the rights.
 */
export function MfaAction({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const mfaEnabled = useCurrentUser().data?.mfaEnabled === true;
  const reauth = useContext(ReauthContext);
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  if (!mfaEnabled || !reauth) {
    return (
      <ButtonLink to={MFA_SETUP_URL} size={size} variant="secondary" leftIcon={<ShieldCheck size={14} />}>
        Set up two-factor authentication
      </ButtonLink>
    );
  }

  async function confirm() {
    setBusy(true);
    try {
      await reauth?.requestReauth([{ id: 'mfa_reauthenticate', types: ['totp'] }]);
      // Effective permissions change with it: read everything again.
      await queryClient.invalidateQueries();
    } catch (error) {
      if (!isReauthCancelled(error)) throw error;
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size={size} variant="secondary" leftIcon={<ShieldCheck size={14} />} loading={busy} onClick={() => void confirm()}>
      Confirm with authentication code
    </Button>
  );
}
