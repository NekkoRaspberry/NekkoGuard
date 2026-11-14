import { createBrowserRouter, type RouteObject } from 'react-router';
import { RedirectIfAuthenticated, RequireAuth, RequirePendingFlow } from '@/features/auth/RouteGuards';
import { AppShell } from '@/layout/AppShell/AppShell';
import type { RouteHandle } from '@/layout/TopBar/TopBar';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { RouteErrorPage } from '@/pages/RouteErrorPage';
import { ROUTES } from './routes';

const crumbs = (...items: string[]): RouteHandle => ({ crumbs: items });

/** Code-split page loader. */
const page = (load: () => Promise<{ Component: React.ComponentType }>): Pick<RouteObject, 'lazy'> => ({ lazy: load });

const authPages = {
  login: page(async () => ({ Component: (await import('@/features/auth/pages/LoginPage')).LoginPage })),
  mfa: page(async () => ({ Component: (await import('@/features/auth/pages/MfaChallengePage')).MfaChallengePage })),
  signup: page(async () => ({ Component: (await import('@/features/auth/pages/SignupPage')).SignupPage })),
  verifyPending: page(async () => ({ Component: (await import('@/features/auth/pages/VerifyEmailPendingPage')).VerifyEmailPendingPage })),
  verifyEmail: page(async () => ({ Component: (await import('@/features/auth/pages/VerifyEmailPage')).VerifyEmailPage })),
  forgot: page(async () => ({ Component: (await import('@/features/auth/pages/ForgotPasswordPage')).ForgotPasswordPage })),
  reset: page(async () => ({ Component: (await import('@/features/auth/pages/ResetPasswordPage')).ResetPasswordPage })),
};

/**
 * Every route maps to backend functionality:
 *  - auth pages              → django-allauth headless (/_allauth/browser/v1/…)
 *  - /                       → GET /api/users/me/ + WebSocket heartbeat
 *  - /account/profile        → GET /api/users/me/, PATCH /api/users/{pk}/
 *  - /account/security       → allauth account endpoints (password, emails, 2FA)
 */
export const router = createBrowserRouter([
  {
    errorElement: <RouteErrorPage />,
    children: [
      // Signed-out only
      {
        element: <RedirectIfAuthenticated />,
        children: [
          { path: ROUTES.login, ...authPages.login },
          { path: ROUTES.signup, ...authPages.signup },
          { path: ROUTES.forgotPassword, ...authPages.forgot },
          {
            element: <RequirePendingFlow flow="mfa_authenticate" />,
            children: [{ path: ROUTES.loginMfa, ...authPages.mfa }],
          },
          {
            element: <RequirePendingFlow flow="verify_email" />,
            children: [{ path: ROUTES.verifyEmailPending, ...authPages.verifyPending }],
          },
        ],
      },
      // Email links — valid whether or not the user is signed in
      { path: '/verify-email/:key', ...authPages.verifyEmail },
      { path: '/reset-password/:key', ...authPages.reset },
      // Signed in
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppShell />,
            children: [
              {
                errorElement: <RouteErrorPage />,
                children: [
                  {
                    index: true,
                    handle: crumbs('Overview'),
                    ...page(async () => ({ Component: (await import('@/features/overview/pages/OverviewPage')).OverviewPage })),
                  },
                  {
                    path: ROUTES.profile,
                    handle: crumbs('Account', 'Profile'),
                    ...page(async () => ({ Component: (await import('@/features/account/pages/ProfilePage')).ProfilePage })),
                  },
                  {
                    path: ROUTES.security,
                    handle: crumbs('Account', 'Security'),
                    ...page(async () => ({ Component: (await import('@/features/account/pages/SecurityPage')).SecurityPage })),
                  },
                  { path: '*', handle: crumbs('Not found'), Component: NotFoundPage },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
]);
