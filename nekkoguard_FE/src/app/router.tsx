import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { RedirectIfAuthenticated, RequireAuth, RequirePendingFlow } from '@/features/auth/RouteGuards';
import type * as OrganizationSettingsPages from '@/features/settings/pages/OrganizationSettingsPages';
import type * as TenantSettingsPages from '@/features/settings/pages/TenantSettingsPages';
import { AppShell } from '@/layout/AppShell/AppShell';
import type { Crumb, RouteHandle } from '@/layout/TopBar/TopBar';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { RouteErrorPage } from '@/pages/RouteErrorPage';
import { ROUTES } from './routes';

const crumbs = (...items: Crumb[]): RouteHandle => ({ crumbs: items });

// "Account" has no page of its own yet — it links to the first account page.
const ACCOUNT_CRUMB: Crumb = { label: 'Account', to: ROUTES.profile };
const SETTINGS_CRUMB: Crumb = { label: 'Settings', to: ROUTES.organizationSettings };

/** Code-split page loader. */
const page = (load: () => Promise<{ Component: React.ComponentType }>): Pick<RouteObject, 'lazy'> => ({ lazy: load });

type OrgSettingsPage = keyof typeof OrganizationSettingsPages;
type TenantSettingsPage = keyof typeof TenantSettingsPages;
const orgSettings = (name: OrgSettingsPage) =>
  page(async () => ({ Component: (await import('@/features/settings/pages/OrganizationSettingsPages'))[name] }));
const tenantSettings = (name: TenantSettingsPage) =>
  page(async () => ({ Component: (await import('@/features/settings/pages/TenantSettingsPages'))[name] }));

const authPages = {
  login: page(async () => ({ Component: (await import('@/features/auth/pages/LoginPage')).LoginPage })),
  mfa: page(async () => ({ Component: (await import('@/features/auth/pages/MfaChallengePage')).MfaChallengePage })),
  signup: page(async () => ({ Component: (await import('@/features/auth/pages/SignupPage')).SignupPage })),
  verifyPending: page(async () => ({ Component: (await import('@/features/auth/pages/VerifyEmailPendingPage')).VerifyEmailPendingPage })),
  verifyEmail: page(async () => ({ Component: (await import('@/features/auth/pages/VerifyEmailPage')).VerifyEmailPage })),
  forgot: page(async () => ({ Component: (await import('@/features/auth/pages/ForgotPasswordPage')).ForgotPasswordPage })),
  reset: page(async () => ({ Component: (await import('@/features/auth/pages/ResetPasswordPage')).ResetPasswordPage })),
  providerSignup: page(async () => ({ Component: (await import('@/features/auth/pages/ProviderSignupPage')).ProviderSignupPage })),
  providerCallback: page(async () => ({ Component: (await import('@/features/auth/pages/ProviderCallbackPage')).ProviderCallbackPage })),
};

/**
 * Every route maps to backend functionality:
 *  - auth pages              → django-allauth headless (/_allauth/browser/v1/…)
 *  - /                       → GET /api/users/me/ + WebSocket heartbeat
 *  - /account/profile        → GET /api/users/me/, PATCH /api/users/{pk}/
 *  - /account/security       → allauth account endpoints (password, emails, 2FA)
 *  - /infrastructure         → /api/tenants/{t}/organizations/{o}/sites|networks/
 *  - /settings/organization… → /api/tenants/{t}/organizations/{o}/ (+ members, overrides, access, activity)
 *  - /settings/tenant…       → /api/tenants/{t}/ (+ members, organizations, activity)
 *  - /settings/platform/…    → /api/platform/tenants/ (staff only)
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
            element: <RequirePendingFlow flow="provider_signup" />,
            children: [{ path: ROUTES.providerSignup, ...authPages.providerSignup }],
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
      // Google/GitHub/LinkedIn return here (signing in or linking an account)
      { path: ROUTES.providerCallback, ...authPages.providerCallback },
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
                    handle: crumbs({ label: 'Overview', to: ROUTES.overview }),
                    ...page(async () => ({ Component: (await import('@/features/overview/pages/OverviewPage')).OverviewPage })),
                  },
                  {
                    path: ROUTES.profile,
                    handle: crumbs(ACCOUNT_CRUMB, { label: 'Profile', to: ROUTES.profile }),
                    ...page(async () => ({ Component: (await import('@/features/account/pages/ProfilePage')).ProfilePage })),
                  },
                  {
                    path: ROUTES.connectedApps,
                    handle: crumbs(ACCOUNT_CRUMB, { label: 'Connected applications', to: ROUTES.connectedApps }),
                    ...page(async () => ({ Component: (await import('@/features/account/pages/ConnectedAppsPage')).ConnectedAppsPage })),
                  },
                  {
                    path: ROUTES.security,
                    handle: crumbs(ACCOUNT_CRUMB, { label: 'Security', to: ROUTES.security }),
                    ...page(async () => ({ Component: (await import('@/features/account/pages/SecurityPage')).SecurityPage })),
                  },
                  {
                    path: ROUTES.infrastructure,
                    handle: crumbs({ label: 'Sites & networks', to: ROUTES.infrastructure }),
                    ...page(async () => ({ Component: (await import('@/features/infrastructure/pages/InfrastructurePage')).InfrastructurePage })),
                  },
                  {
                    path: '/settings',
                    ...page(async () => ({ Component: (await import('@/features/settings/SettingsLayout')).SettingsLayout })),
                    children: [
                      { index: true, element: <Navigate to={ROUTES.organizationSettings} replace /> },
                      {
                        path: ROUTES.organizationSettings,
                        handle: crumbs(SETTINGS_CRUMB, { label: 'Organization', to: ROUTES.organizationSettings }),
                        ...orgSettings('OrganizationDetailsPage'),
                      },
                      {
                        path: ROUTES.organizationMembers,
                        handle: crumbs(SETTINGS_CRUMB, { label: 'Organization members', to: ROUTES.organizationMembers }),
                        ...orgSettings('OrganizationMembersPage'),
                      },
                      {
                        path: ROUTES.organizationAccess,
                        handle: crumbs(SETTINGS_CRUMB, { label: 'Access & permissions', to: ROUTES.organizationAccess }),
                        ...orgSettings('OrganizationAccessPage'),
                      },
                      {
                        path: ROUTES.organizationActivity,
                        handle: crumbs(SETTINGS_CRUMB, { label: 'Organization activity', to: ROUTES.organizationActivity }),
                        ...orgSettings('OrganizationActivityPage'),
                      },
                      {
                        path: ROUTES.tenantSettings,
                        handle: crumbs(SETTINGS_CRUMB, { label: 'Tenant', to: ROUTES.tenantSettings }),
                        ...tenantSettings('TenantDetailsPage'),
                      },
                      {
                        path: ROUTES.tenantOrganizations,
                        handle: crumbs(SETTINGS_CRUMB, { label: 'Organizations', to: ROUTES.tenantOrganizations }),
                        ...tenantSettings('TenantOrganizationsPage'),
                      },
                      {
                        path: `${ROUTES.tenantOrganizations}/:orgId`,
                        handle: crumbs(SETTINGS_CRUMB, { label: 'Organizations', to: ROUTES.tenantOrganizations }, { label: 'Manage', to: ROUTES.tenantOrganizations }),
                        ...tenantSettings('TenantOrganizationPage'),
                      },
                      {
                        path: ROUTES.tenantMembers,
                        handle: crumbs(SETTINGS_CRUMB, { label: 'Tenant members', to: ROUTES.tenantMembers }),
                        ...tenantSettings('TenantMembersPage'),
                      },
                      {
                        path: ROUTES.tenantActivity,
                        handle: crumbs(SETTINGS_CRUMB, { label: 'Tenant activity', to: ROUTES.tenantActivity }),
                        ...tenantSettings('TenantActivityPage'),
                      },
                      {
                        path: ROUTES.platformTenants,
                        handle: crumbs(SETTINGS_CRUMB, { label: 'Platform tenants', to: ROUTES.platformTenants }),
                        ...page(async () => ({ Component: (await import('@/features/settings/pages/PlatformSettingsPage')).PlatformTenantsPage })),
                      },
                    ],
                  },
                  { path: '*', handle: crumbs({ label: 'Overview', to: ROUTES.overview }, { label: 'Not found', to: ROUTES.overview }), Component: NotFoundPage },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
]);
