import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, LogOut } from 'lucide-react';
import { useState } from 'react';
import { getErrorMessage } from '@/api/errors';
import { termsApi, type TermsVersionDto } from '@/api/terms';
import { Banner } from '@/components/Banner/Banner';
import { Button } from '@/components/Button/Button';
import { Logo } from '@/components/Logo/Logo';
import { ConfirmDialog } from '@/components/Modal/ConfirmDialog';
import { useAuth } from '@/features/auth/useAuth';
import { TermsReader } from './TermsDocument';
import { TermsMeta } from './TermsMeta';
import styles from './TermsAcceptanceScreen.module.css';

/**
 * Mandatory acceptance of one Tenant's current Terms. Accept records the acceptance
 * of this exact version; Decline is recorded and signs the user out. There is no
 * other way into the app (the backend refuses every other API call meanwhile).
 */
export function TermsAcceptanceScreen({ version, total }: { version: TermsVersionDto; position: number; total: number }) {
  const queryClient = useQueryClient();
  const { signOut } = useAuth();
  const [confirmDecline, setConfirmDecline] = useState(false);
  const tenantName = version.tenant.name;

  const accept = useMutation({
    mutationFn: () => termsApi.accept(version.id),
    // Everything cached while access was blocked is re-fetched.
    onSuccess: () => void queryClient.invalidateQueries(),
  });

  const decline = useMutation({
    mutationFn: async () => {
      try {
        await termsApi.decline(); // recorded and signed out on the server
      } finally {
        await signOut('terms_declined'); // and here, whatever happened
      }
    },
  });

  const busy = accept.isPending || decline.isPending;
  const error = accept.error ?? decline.error;

  return (
    <div className={styles.screen}>
      <header className={styles.bar}>
        <Logo />
        <span className={styles.tenant}>{tenantName}</span>
        {total > 1 && <span className={styles.progress}>{total} Terms of Service to accept</span>}
      </header>
      <main className={styles.body} aria-labelledby="terms-acceptance-heading">
        <div className={styles.intro}>
          <h1 id="terms-acceptance-heading" className={styles.heading}>
            Review the Terms of Service
          </h1>
          <p className={styles.lead}>
            {tenantName} requires you to accept its Terms of Service to use NekkoGuard. Read them below, then accept or decline.
          </p>
        </div>
        <TermsReader title={version.title} meta={<TermsMeta version={version} />} doc={version.content} prefix="accept-" />
      </main>
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          {error ? (
            <Banner tone="danger" className={styles.footerError}>
              {getErrorMessage(error)}
            </Banner>
          ) : (
            <p className={styles.statement}>
              Accepting is required to use NekkoGuard. By selecting <strong>Accept</strong>, you agree to version {version.number} of the
              Terms of Service of {tenantName}.
            </p>
          )}
          <div className={styles.actions}>
            <Button variant="secondary" leftIcon={<LogOut size={14} />} disabled={busy} onClick={() => setConfirmDecline(true)}>
              Decline
            </Button>
            <Button variant="primary" leftIcon={<Check size={14} />} loading={accept.isPending} disabled={busy} onClick={() => accept.mutate()}>
              Accept
            </Button>
          </div>
        </div>
      </footer>
      <ConfirmDialog
        open={confirmDecline}
        onOpenChange={(open) => !open && !decline.isPending && setConfirmDecline(false)}
        title="Decline and sign out?"
        description="NekkoGuard can't be used without accepting these Terms of Service. You will be signed out; sign in again whenever you are ready to accept them."
        confirmLabel="Decline and sign out"
        loading={decline.isPending}
        onConfirm={() => decline.mutate()}
      />
    </div>
  );
}
