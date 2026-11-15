import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, CheckCircle2, MailX } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { getErrorMessage, isApiError } from '@/api/errors';
import { queryKeys } from '@/api/queryKeys';
import { tenancyApi, type InvitationLinkDto } from '@/api/tenancy';
import { ROUTES } from '@/app/routes';
import { Banner } from '@/components/Banner/Banner';
import { Button, ButtonLink } from '@/components/Button/Button';
import { Spinner } from '@/components/Spinner/Spinner';
import { AuthHeading } from '@/features/auth/components/AuthHeading';
import type { LoginLocationState } from '@/features/auth/RouteGuards';
import { useAuth } from '@/features/auth/useAuth';
import { ORGANIZATION_ROLE_LABELS } from '@/features/tenancy/model';
import { rememberSelection } from '@/features/tenancy/storage';
import { EntranceLayout } from '@/layout/EntranceLayout/EntranceLayout';
import { formatDateTime } from '@/lib/format';
import styles from '@/features/auth/pages/AuthPages.module.css';

/** Passed to the sign-up page: the invited address, prefilled. */
export interface InvitationSignupState {
  invitation?: { email: string; organizationName: string };
}

const CLOSED: Record<Exclude<InvitationLinkDto['status'], 'pending'>, { title: string; text: string }> = {
  accepted: { title: 'Invitation already used', text: 'This invitation has already been accepted. Sign in to continue.' },
  expired: { title: 'Invitation expired', text: 'This invitation has expired. Ask the person who invited you to send a new one.' },
  revoked: { title: 'Invitation withdrawn', text: 'This invitation is no longer valid. Ask the organization administrator if you still need access.' },
  unavailable: { title: 'Organization unavailable', text: 'The organization of this invitation is currently not available.' },
};

/**
 * Landing page of the emailed invitation link: /invitations/:token (any auth state).
 * Signed out: create an account with the invited address (verifying it joins the
 * organization) or sign in. Signed in: accept — the server checks that the account
 * owns the invited, verified address.
 */
export function InvitationPage() {
  const { token = '' } = useParams();
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const link = useQuery({
    queryKey: queryKeys.invitationLink(token),
    queryFn: ({ signal }) => tenancyApi.getInvitationLink(token, signal),
    retry: false,
  });

  const accept = useMutation({
    mutationFn: () => tenancyApi.acceptInvitation(token),
    onSuccess: (accepted) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tenants });
      void queryClient.invalidateQueries({ queryKey: queryKeys.myOrganizations });
      // Open the new organization next (remembered, never put in the URL).
      rememberSelection({ tenant: accepted.tenant, org: accepted.organization, site: null, network: null }, user?.id ?? null);
      navigate(ROUTES.overview, { replace: true });
    },
  });

  if (link.isPending) {
    return (
      <EntranceLayout>
        <div className={styles.loadingRow}>
          <Spinner /> Checking your invitation…
        </div>
      </EntranceLayout>
    );
  }

  const back = (
    <ButtonLink to={isAuthenticated ? ROUTES.overview : ROUTES.login} variant="secondary" fullWidth>
      {isAuthenticated ? 'Continue to NekkoGuard' : 'Go to sign in'}
    </ButtonLink>
  );

  if (link.isError) {
    const notFound = isApiError(link.error) && link.error.status === 404;
    return (
      <EntranceLayout>
        <AuthHeading
          tone="danger"
          icon={<MailX size={20} />}
          title={notFound ? 'Invitation link not valid' : 'Could not open the invitation'}
          subtitle={notFound ? 'This link is not valid. Check that you used the latest invitation email.' : getErrorMessage(link.error)}
        />
        {back}
      </EntranceLayout>
    );
  }

  const invitation = link.data;
  if (invitation.status !== 'pending') {
    const closed = CLOSED[invitation.status];
    return (
      <EntranceLayout>
        <AuthHeading tone="danger" icon={<MailX size={20} />} title={closed.title} subtitle={closed.text} />
        {back}
      </EntranceLayout>
    );
  }

  const heading = (
    <AuthHeading
      icon={<Building2 size={20} />}
      title={`Join ${invitation.organization_name}`}
      subtitle={
        <>
          <strong>{invitation.invited_by}</strong> invited <strong>{invitation.email}</strong> to join{' '}
          <strong>{invitation.organization_name}</strong> on NekkoGuard with {ORGANIZATION_ROLE_LABELS[invitation.role]}{' '}
          (view-only) access. The invitation expires on {formatDateTime(Date.parse(invitation.expires_at))}.
        </>
      }
    />
  );

  if (isAuthenticated) {
    const sameAddress = user?.email?.toLowerCase() === invitation.email;
    return (
      <EntranceLayout>
        {heading}
        {!sameAddress && (
          <Banner tone="warning" className={styles.banner}>
            You are signed in as {user?.email}. Only the account that uses {invitation.email} (verified) can accept this
            invitation.
          </Banner>
        )}
        {accept.isError && (
          <Banner tone="danger" className={styles.banner}>
            {getErrorMessage(accept.error, 'The invitation could not be accepted.')}
          </Banner>
        )}
        <Button
          variant="primary"
          size="lg"
          fullWidth
          leftIcon={<CheckCircle2 size={16} />}
          loading={accept.isPending}
          onClick={() => accept.mutate()}
        >
          Accept invitation
        </Button>
      </EntranceLayout>
    );
  }

  const loginState: LoginLocationState = { from: ROUTES.invitation(token) };
  const signupState: InvitationSignupState = {
    invitation: { email: invitation.email, organizationName: invitation.organization_name },
  };
  return (
    <EntranceLayout
      footer={
        <>
          Already have an account?{' '}
          <Link to={ROUTES.login} state={loginState} className={styles.footerLink}>
            Sign in to accept
          </Link>
        </>
      }
    >
      {heading}
      <p className={styles.subtitle}>
        Create your account with <strong>{invitation.email}</strong>. As soon as you verify that address, you become a
        member of {invitation.organization_name}.
      </p>
      <ButtonLink to={ROUTES.signup} state={signupState} variant="primary" size="lg" fullWidth>
        Create your account
      </ButtonLink>
    </EntranceLayout>
  );
}
