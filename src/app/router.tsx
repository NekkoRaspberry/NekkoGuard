import { createBrowserRouter } from 'react-router';
import { RedirectIfAuthenticated, RequireAuth } from '@/features/auth/RouteGuards';
import { AppShell } from '@/layout/AppShell/AppShell';
import type { RouteHandle } from '@/layout/TopBar/TopBar';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { RouteErrorPage } from '@/pages/RouteErrorPage';
import { ROUTES } from './routes';

const crumbs = (...items: string[]): RouteHandle => ({ crumbs: items });

/**
 * Routes reflect only backend-supported functionality:
 *  - /login              → POST /api/auth-token/
 *  - /                   → GET /api/users/me/ + WebSocket heartbeat
 *  - /account/profile    → GET /api/users/me/, PATCH /api/users/{pk}/
 *  - /account/security   → links to allauth server pages (password, 2FA, emails)
 * Pages are code-split and loaded on first visit.
 */
export const router = createBrowserRouter([
  {
    errorElement: <RouteErrorPage />,
    children: [
      {
        element: <RedirectIfAuthenticated />,
        children: [
          {
            path: ROUTES.login,
            lazy: async () => ({ Component: (await import('@/features/auth/pages/LoginPage')).LoginPage }),
          },
        ],
      },
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
                    lazy: async () => ({ Component: (await import('@/features/overview/pages/OverviewPage')).OverviewPage }),
                  },
                  {
                    path: ROUTES.profile,
                    handle: crumbs('Account', 'Profile'),
                    lazy: async () => ({ Component: (await import('@/features/account/pages/ProfilePage')).ProfilePage }),
                  },
                  {
                    path: ROUTES.security,
                    handle: crumbs('Account', 'Security'),
                    lazy: async () => ({ Component: (await import('@/features/account/pages/SecurityPage')).SecurityPage }),
                  },
                  {
                    path: '*',
                    handle: crumbs('Not found'),
                    Component: NotFoundPage,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
]);
