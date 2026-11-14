import { useQuery } from '@tanstack/react-query';
import { OAUTH_PATHS, oauthApps } from '@/api/oauthApps';
import { queryKeys } from '@/api/queryKeys';
import { CopyValue } from './CopyValue';

/** Endpoints an application needs (absolute URLs for the address NekkoGuard is opened on). */
export function IntegrationDetails() {
  const origin = window.location.origin;
  const oidc = useQuery({ queryKey: queryKeys.oidcEnabled, queryFn: oauthApps.oidcEnabled, staleTime: Infinity });

  return (
    <>
      <CopyValue label="Authorization URL" value={`${origin}${OAUTH_PATHS.authorize}`} />
      <CopyValue label="Token URL" value={`${origin}${OAUTH_PATHS.token}`} />
      <CopyValue label="Profile URL (scope “profile”)" value={`${origin}${OAUTH_PATHS.profile}`} />
      {oidc.data && <CopyValue label="OpenID Connect discovery" value={`${origin}${OAUTH_PATHS.oidcDiscovery}`} />}
    </>
  );
}
