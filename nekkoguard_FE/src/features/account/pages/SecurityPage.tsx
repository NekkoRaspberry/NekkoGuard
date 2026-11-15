import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { Banner } from '@/components/Banner/Banner';
import { useCurrentUser } from '@/features/account/hooks/useCurrentUser';
import { MfaAction } from '@/features/account/mfa/MfaAction';
import { EmailAddressesCard } from '../components/security/EmailAddressesCard';
import { PasswordCard } from '../components/security/PasswordCard';
import { SessionsCard } from '../components/security/SessionsCard';
import { SignInProvidersCard } from '../components/security/SignInProvidersCard';
import { TwoFactorCard } from '../components/security/TwoFactorCard';
import styles from './AccountPages.module.css';

/** Settings → Profile → Security: the only security page (account-level). */
export function SecurityPage() {
  const { hash } = useLocation();
  const user = useCurrentUser().data;
  const mfaRequired = user?.mfaRequired === true;

  // Deep links such as /settings/profile/security#emails scroll to the matching card.
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash]);

  return (
    <div className={styles.page}>
      <div className={styles.stack}>
        {mfaRequired &&
          (user?.mfaEnabled ? (
            <Banner
              tone="warning"
              title="Confirm two-factor authentication to administer your tenant"
              action={<MfaAction />}
            >
              This session signed in without your authentication code. Until you confirm it, you have the same access as
              a tenant member.
            </Banner>
          ) : (
            <Banner tone="warning" title="Two-factor authentication is required to administer your tenant">
              Set up an authenticator app below. Until then you have the same access as a tenant member; administration
              becomes available as soon as it is turned on.
            </Banner>
          ))}
        <TwoFactorCard />
        <PasswordCard />
        <EmailAddressesCard />
        <SignInProvidersCard />
        <SessionsCard />
      </div>
    </div>
  );
}
