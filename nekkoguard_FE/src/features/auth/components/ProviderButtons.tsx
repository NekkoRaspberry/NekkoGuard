import { useState } from 'react';
import { useLocation } from 'react-router';
import { redirectToProvider } from '@/api/allauth';
import { Button } from '@/components/Button/Button';
import { useAuthConfig } from '../hooks/useAuthConfig';
import { providerCallbackUrl } from '../providerCallback';
import styles from './ProviderButtons.module.css';
import { ProviderIcon } from './ProviderIcon';

/**
 * "Continue with Google / GitHub / LinkedIn". Renders only the providers the backend
 * reports in its config (a provider is active once its credentials are configured).
 */
export function ProviderButtons({ verb = 'Continue' }: { verb?: string }) {
  const { data: config } = useAuthConfig();
  const { search } = useLocation();
  const [pending, setPending] = useState<string | null>(null);
  const providers = (config?.socialaccount?.providers ?? []).filter((provider) => provider.flows.includes('provider_redirect'));

  if (providers.length === 0) return null;

  return (
    <div className={styles.root}>
      <div className={styles.divider} role="separator">
        <span>or</span>
      </div>
      <div className={styles.buttons}>
        {providers.map((provider) => (
          <Button
            key={provider.id}
            variant="secondary"
            size="lg"
            fullWidth
            leftIcon={<ProviderIcon provider={provider.id} />}
            loading={pending === provider.id}
            disabled={pending !== null}
            onClick={() => {
              setPending(provider.id);
              redirectToProvider(provider.id, 'login', providerCallbackUrl(search));
            }}
          >
            {verb} with {provider.name}
          </Button>
        ))}
      </div>
    </div>
  );
}
