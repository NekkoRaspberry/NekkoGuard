import { useQueryClient } from '@tanstack/react-query';
import { LogOut, MonitorSmartphone } from 'lucide-react';
import { useState } from 'react';
import { allauth } from '@/api/allauth';
import { getErrorMessage } from '@/api/errors';
import { queryKeys } from '@/api/queryKeys';
import type { UserSessionDto } from '@/api/types';
import { Banner } from '@/components/Banner/Banner';
import { Button } from '@/components/Button/Button';
import { Card, CardBody, CardHeader } from '@/components/Card/Card';
import { ErrorState } from '@/components/ErrorState/ErrorState';
import { ConfirmDialog } from '@/components/Modal/ConfirmDialog';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import { StatusPill } from '@/components/StatusPill/StatusPill';
import { useToast } from '@/components/Toast/useToast';
import { useAuth } from '@/features/auth/useAuth';
import { formatDateTime, formatRelative } from '@/lib/format';
import { useSessions } from '../../hooks/useSecurityData';
import { describeDevice } from './sessionDevice';
import styles from './Security.module.css';

/** What the confirmation dialog is about to do. */
type Pending = { kind: 'one'; session: UserSessionDto } | { kind: 'others' } | { kind: 'current' };

function byCurrentThenNewest(a: UserSessionDto, b: UserSessionDto): number {
  if (a.is_current !== b.is_current) return a.is_current ? -1 : 1;
  return b.created_at - a.created_at;
}

function SessionRow({
  session,
  disabled,
  onSignOut,
}: {
  session: UserSessionDto;
  disabled: boolean;
  onSignOut: () => void;
}) {
  const device = describeDevice(session.user_agent);
  const meta = [session.ip, `Signed in ${formatDateTime(session.created_at * 1000)}`];
  // Only when the server tracks activity (DJANGO_USERSESSIONS_TRACK_ACTIVITY); never guessed.
  if (session.last_seen_at !== undefined) meta.push(`Last active ${formatRelative(session.last_seen_at * 1000)}`);

  return (
    <li className={styles.row}>
      <div className={styles.rowMain}>
        <span className={styles.rowTitle} title={session.user_agent || undefined}>
          {device}
          {session.is_current && <StatusPill tone="primary" label="This browser" />}
        </span>
        <span className={styles.rowMeta}>{meta.join(' · ')}</span>
      </div>
      <div className={styles.rowActions}>
        <Button
          size="sm"
          variant="ghost"
          leftIcon={<LogOut size={14} />}
          disabled={disabled}
          onClick={onSignOut}
          aria-label={session.is_current ? 'Sign out of this browser' : `Sign out ${device}`}
        >
          Sign out
        </Button>
      </div>
    </li>
  );
}

/** Profile → Security: every signed-in session, with sign-out per session or all others. */
export function SessionsCard() {
  const sessions = useSessions();
  const queryClient = useQueryClient();
  const { signOut } = useAuth();
  const { notify } = useToast();
  const [pending, setPending] = useState<Pending | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = [...(sessions.data ?? [])].sort(byCurrentThenNewest);
  const others = list.filter((session) => !session.is_current);

  async function confirm() {
    if (!pending) return;
    setWorking(true);
    setError(null);
    try {
      if (pending.kind === 'current') {
        await signOut(); // ends this session on the server and leaves the app
        return;
      }
      const ids = pending.kind === 'one' ? [pending.session.id] : others.map((session) => session.id);
      const envelope = await allauth.endSessions(ids);
      if (envelope.data) queryClient.setQueryData(queryKeys.sessions, envelope);
      notify({
        tone: 'success',
        title: pending.kind === 'one' ? 'Session signed out' : 'Other sessions signed out',
        description:
          pending.kind === 'one'
            ? `${describeDevice(pending.session.user_agent)} is no longer signed in.`
            : 'Only this browser is still signed in.',
      });
    } catch (caught) {
      // Typically: the session had already ended (expired or signed out elsewhere).
      setError(getErrorMessage(caught, 'Could not sign out that session. The list was refreshed.'));
      void sessions.refetch();
    } finally {
      setWorking(false);
      setPending(null);
    }
  }

  const dialog = (() => {
    if (pending?.kind === 'one') {
      return {
        title: 'Sign out this session?',
        description: (
          <>
            <strong>{describeDevice(pending.session.user_agent)}</strong> ({pending.session.ip}) will be signed out
            immediately and must sign in again.
          </>
        ),
        confirmLabel: 'Sign out session',
      };
    }
    if (pending?.kind === 'others') {
      return {
        title: 'Sign out all other sessions?',
        description: `${others.length} other ${others.length === 1 ? 'session' : 'sessions'} will be signed out immediately. This browser stays signed in.`,
        confirmLabel: 'Sign out other sessions',
      };
    }
    return {
      title: 'Sign out of this browser?',
      description: 'You will be signed out here and taken to the sign-in page.',
      confirmLabel: 'Sign out',
    };
  })();

  return (
    <Card aria-labelledby="sessions-title" id="sessions">
      <CardHeader
        icon={<MonitorSmartphone size={16} />}
        title="Active sessions"
        titleId="sessions-title"
        description="Browsers signed in to your account. A session ends when its browser closes, or when you sign it out here."
      />
      <CardBody>
        {error && <Banner tone="danger">{error}</Banner>}

        {sessions.isPending ? (
          <div className={styles.formStack}>
            <Skeleton height={18} width="55%" />
            <Skeleton height={18} width="40%" />
          </div>
        ) : sessions.isError ? (
          <ErrorState error={sessions.error} onRetry={() => void sessions.refetch()} retrying={sessions.isFetching} />
        ) : (
          <>
            <ul className={styles.list} aria-label="Active sessions">
              {list.map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  disabled={working}
                  onSignOut={() => setPending(session.is_current ? { kind: 'current' } : { kind: 'one', session })}
                />
              ))}
            </ul>
            <div className={styles.divider} />
            <div className={styles.rowActions}>
              <Button
                variant="secondary"
                leftIcon={<LogOut size={16} />}
                disabled={working || others.length === 0}
                onClick={() => setPending({ kind: 'others' })}
              >
                Sign out all other sessions
              </Button>
            </div>
          </>
        )}
      </CardBody>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && !working && setPending(null)}
        title={dialog.title}
        description={dialog.description}
        confirmLabel={dialog.confirmLabel}
        loading={working}
        onConfirm={() => void confirm()}
      />
    </Card>
  );
}
