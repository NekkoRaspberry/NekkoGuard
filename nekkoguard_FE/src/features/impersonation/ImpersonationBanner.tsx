import { Eye } from 'lucide-react';
import { Banner } from '@/components/Banner/Banner';
import { Button } from '@/components/Button/Button';
import { useImpersonation, useStopImpersonation } from './useImpersonation';

/** Always visible while a superuser views the app as someone else. */
export function ImpersonationBanner({ className }: { className?: string }) {
  const status = useImpersonation().data;
  const stop = useStopImpersonation();
  if (!status?.active || !status.user) return null;
  const viewed = status.user.name ? `${status.user.name} (${status.user.email})` : status.user.email;
  return (
    <Banner
      tone="warning"
      title={`Viewing NekkoGuard as ${viewed}`}
      action={
        <Button size="sm" variant="secondary" leftIcon={<Eye size={14} />} loading={stop.isPending} onClick={() => stop.mutate()}>
          Back to my account
        </Button>
      }
      className={className}
    >
      Read-only: you see exactly what they see, and changes are disabled. You are still signed in as{' '}
      {status.real_user?.email}.
    </Banner>
  );
}
