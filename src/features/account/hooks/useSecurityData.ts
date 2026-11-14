import { useQuery } from '@tanstack/react-query';
import { allauth } from '@/api/allauth';
import { queryKeys } from '@/api/queryKeys';
import type { AuthenticatorDto, RecoveryCodesAuthenticatorDto, TotpAuthenticatorDto } from '@/api/types';

export function useEmailAddresses() {
  return useQuery({
    queryKey: queryKeys.emails,
    queryFn: allauth.listEmails,
    select: (envelope) => envelope.data ?? [],
  });
}

export interface AuthenticatorSummary {
  totp: TotpAuthenticatorDto | null;
  recoveryCodes: RecoveryCodesAuthenticatorDto | null;
}

function summarise(list: AuthenticatorDto[]): AuthenticatorSummary {
  return {
    totp: list.find((item): item is TotpAuthenticatorDto => item.type === 'totp') ?? null,
    recoveryCodes: list.find((item): item is RecoveryCodesAuthenticatorDto => item.type === 'recovery_codes') ?? null,
  };
}

export function useAuthenticators() {
  return useQuery({
    queryKey: queryKeys.authenticators,
    queryFn: allauth.listAuthenticators,
    select: (envelope) => summarise(envelope.data ?? []),
  });
}
