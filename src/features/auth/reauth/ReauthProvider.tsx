import { ShieldCheck } from 'lucide-react';
import { useCallback, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { allauth } from '@/api/allauth';
import type { Flow } from '@/api/types';
import { Banner } from '@/components/Banner/Banner';
import { Button } from '@/components/Button/Button';
import { Modal } from '@/components/Modal/Modal';
import formStyles from '@/components/Modal/ModalForm.module.css';
import { CodeField } from '@/components/TextField/CodeField';
import { PasswordField } from '@/components/TextField/PasswordField';
import { useAuth } from '../useAuth';
import { useFormErrors } from '../useFormErrors';
import { ReauthCancelledError, ReauthContext } from './ReauthContext';

type Method = 'password' | 'mfa';

interface Pending {
  methods: Method[];
  resolve: () => void;
  reject: (error: Error) => void;
}

const FIELDS = ['password', 'code'] as const;

function methodsFor(flows: Flow[]): Method[] {
  const methods: Method[] = [];
  if (flows.some((flow) => flow.id === 'reauthenticate')) methods.push('password');
  if (flows.some((flow) => flow.id === 'mfa_reauthenticate')) methods.push('mfa');
  return methods.length ? methods : ['password'];
}

/** Renders the "confirm it's you" dialog for sensitive account actions. */
export function ReauthProvider({ children }: { children: ReactNode }) {
  const { applySession } = useAuth();
  const pendingRef = useRef<Pending | null>(null);
  const [methods, setMethods] = useState<Method[] | null>(null);
  const [method, setMethod] = useState<Method>('password');
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { errors, setErrors, fromError, clearField } = useFormErrors(FIELDS);

  const requestReauth = useCallback(
    (flows: Flow[]) =>
      new Promise<void>((resolve, reject) => {
        pendingRef.current?.reject(new ReauthCancelledError());
        const available = methodsFor(flows);
        pendingRef.current = { methods: available, resolve, reject };
        setMethods(available);
        setMethod(available[0] ?? 'password');
        setValue('');
        setErrors({});
      }),
    [setErrors],
  );

  const close = useCallback(() => {
    pendingRef.current?.reject(new ReauthCancelledError());
    pendingRef.current = null;
    setMethods(null);
    setValue('');
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const field = method === 'password' ? 'password' : 'code';
    if (!value.trim()) {
      setErrors({ [field]: method === 'password' ? 'Enter your password.' : 'Enter the 6-digit code.' });
      return;
    }
    setSubmitting(true);
    try {
      const session = method === 'password' ? await allauth.reauthenticate(value) : await allauth.mfaReauthenticate(value.trim());
      applySession(session);
      pendingRef.current?.resolve();
      pendingRef.current = null;
      setMethods(null);
      setValue('');
    } catch (error) {
      fromError(error, 'Confirmation failed.');
      setValue('');
    } finally {
      setSubmitting(false);
    }
  }

  const contextValue = useMemo(() => ({ requestReauth }), [requestReauth]);
  const otherMethod: Method | undefined = methods?.find((candidate) => candidate !== method);

  return (
    <ReauthContext.Provider value={contextValue}>
      {children}
      <Modal
        open={methods !== null}
        onOpenChange={(open) => !open && close()}
        icon={<ShieldCheck size={18} />}
        title="Confirm it’s you"
        description={
          method === 'password'
            ? 'For your security, enter your password to continue.'
            : 'For your security, enter a code from your authenticator app to continue.'
        }
      >
        <form onSubmit={handleSubmit} noValidate className={formStyles.form}>
          {errors.form && <Banner tone="danger">{errors.form}</Banner>}
          {method === 'password' ? (
            <PasswordField
              label="Password"
              name="current-password"
              autoComplete="current-password"
              autoFocus
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                clearField('password');
              }}
              error={errors.password ?? null}
              disabled={submitting}
            />
          ) : (
            <CodeField
              label="Authentication code"
              name="code"
              autoFocus
              value={value}
              onChange={(event) => {
                setValue(event.target.value.replace(/\D/g, ''));
                clearField('code');
              }}
              error={errors.code ?? null}
              disabled={submitting}
            />
          )}
          <div className={formStyles.actions}>
            {otherMethod ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setMethod(otherMethod);
                  setValue('');
                  setErrors({});
                }}
              >
                {otherMethod === 'mfa' ? 'Use authenticator code' : 'Use password'}
              </Button>
            ) : null}
            <div className={formStyles.actionsEnd}>
              <Button variant="ghost" onClick={close} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={submitting}>
                Confirm
              </Button>
            </div>
          </div>
        </form>
      </Modal>
    </ReauthContext.Provider>
  );
}
