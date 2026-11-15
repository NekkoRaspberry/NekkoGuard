import { createBrowserRouter, type RouteObject } from 'react-router';
import { RedirectIfAuthenticated, RequireAuth, RequirePendingFlow } from '@/features/auth/RouteGuards';
import type * as AppearancePages from '@/features/appearance/pages/AppearancePage';
import type * as SettingsLayouts from '@/features/settings/SettingsLayout';
import type * as OrganizationSettingsPages from '@/features/settings/pages/OrganizationSettingsPages';
import type * as TenantSettingsPages from '@/features/settings/pages/TenantSettingsPages';
import type * as TermsAcceptancePages from '@/features/terms/pages/TermsAcceptancePages';
import { AppShell } from '@/layout/AppShell/AppShell';
import type { Crumb, RouteHandle } from '@/layout/TopBar/TopBar';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { RouteErrorPage } from '@/pages/RouteErrorPage';
import { LegacyRedirect } from './LegacyRedirect';
import { LEGACY_ACCOUNT_ROUTES, ROUTES } from './routes';

const crumbs = (...items: Crumb[]): RouteHandle => ({ crumbs: items });

const SETTINGS_CRUMB: Crumb = { label: 'Settings', to: ROUTES.settings };
const TENANT_CRUMB: Crumb = { label: 'Tenant', to: ROUTES.tenantSettings };
const ORGANIZATION_CRUMB: Crumb = { label: 'Organization', to: ROUTES.organizationSettings };
const PROFILE_CRUMB: Crumb = { label: 'Profile', to: ROUTES.profile };
const SOFTWARE_CRUMB: Crumb = { label: 'Software', to: ROUTES.helpReleases };

/**
 * A settings page: breadcrumb Settings › area › page, and the page header (rendered
 * full width by the settings frame, see SettingsLayout).
 */
const settingsPage = (area: Crumb, label: string, to: string, title: string, description: string): RouteHandle => ({
  crumbs: [SETTINGS_CRUMB, area, ...(area.to === to ? [] : [{ label, to }])],
  page: { title, description },
});

/** Code-split page loader. */
const page = (load: () => Promise<{ Component: React.ComponentType }>): Pick<RouteObject, 'lazy'> => ({ lazy: load });

type OrgSettingsPage = keyof typeof OrganizationSettingsPages;
type TenantSettingsPage = keyof typeof TenantSettingsPages;
const orgSettings = (name: OrgSettingsPage) =>
  page(async () => ({ Component: (await import('@/features/settings/pages/OrganizationSettingsPages'))[name] }));
const tenantSettings = (name: TenantSettingsPage) =>
  page(async () => ({ Component: (await import('@/features/settings/pages/TenantSettingsPages'))[name] }));
const appearancePage = (name: keyof typeof AppearancePages) =>
  page(async () => ({ Component: (await import('@/features/appearance/pages/AppearancePage'))[name] }));
const termsAcceptancePage = (name: keyof typeof TermsAcceptancePages) =>
  page(async () => ({ Component: (await import('@/features/terms/pages/TermsAcceptancePages'))[name] }));
const settingsLayout = (name: keyof typeof SettingsLayouts) =>
  page(async () => ({ Component: (await import('@/features/settings/SettingsLayout'))[name] }));

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
  invitation: page(async () => ({ Component: (await import('@/features/invitations/InvitationPage')).InvitationPage })),
};

/**
 * Every route maps to backend functionality:
 *  - auth pages              → django-allauth headless (/_allauth/browser/v1/…)
 *  - /                       → GET /api/users/me/ + WebSocket heartbeat
 *  - /infrastructure         → /api/tenants/{t}/organizations/{o}/sites|networks/
 *  - /settings/tenant…       → /api/tenants/{t}/ (+ members, organizations, activity, appearance)
 *  - /settings/organization… → /api/tenants/{t}/organizations/{o}/ (+ members, overrides, access, activity, appearance)
 *  - /settings/profile       → GET /api/users/me/, PATCH /api/users/{pk}/
 *  - /settings/profile/security     → allauth account endpoints (password, emails, 2FA, providers)
 *  - /settings/profile/applications → OAuth2 authorized/registered applications
 *  - /help/releases               → /api/help/releases/ (Report a bug: POST /api/bug-reports/)
 *  - /help/terms                  → /api/tenants/{t}/terms/ (+ versions/, acceptances/ for administrators)
 * Platform administration (creating/deactivating Tenants) is not part of this app: it
 * is done in Django admin.
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
      // Organization invitation (signed in: accept; signed out: sign up / sign in)
      { path: '/invitations/:token', ...authPages.invitation },
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
                    path: ROUTES.infrastructure,
                    handle: crumbs({ label: 'Sites & networks', to: ROUTES.infrastructure }),
                    ...page(async () => ({ Component: (await import('@/features/infrastructure/pages/InfrastructurePage')).InfrastructurePage })),
                  },
                  { path: ROUTES.settings, ...settingsLayout('SettingsIndex') },
                  // Settings → Tenant (selected Tenant)
                  {
                    ...settingsLayout('TenantSettingsLayout'),
                    children: [
                      {
                        path: ROUTES.tenantSettings,
                        handle: settingsPage(TENANT_CRUMB, 'Details', ROUTES.tenantSettings, 'Tenant', 'The management environment that owns your organizations.'),
                        ...tenantSettings('TenantDetailsPage'),
                      },
                      {
                        path: ROUTES.tenantOrganizations,
                        handle: settingsPage(TENANT_CRUMB, 'Organizations', ROUTES.tenantOrganizations, 'Organizations', 'Infrastructure environments of {tenant}.'),
                        ...tenantSettings('TenantOrganizationsPage'),
                      },
                      {
                        path: ROUTES.tenantOrganization,
                        handle: {
                          crumbs: [SETTINGS_CRUMB, TENANT_CRUMB, { label: 'Organizations', to: ROUTES.tenantOrganizations }, { label: 'Manage', to: ROUTES.tenantOrganizations }],
                          page: { title: 'Manage organization', description: 'Details, members and permissions of one organization of {tenant}.' },
                        } satisfies RouteHandle,
                        ...tenantSettings('TenantOrganizationPage'),
                      },
                      {
                        path: ROUTES.tenantOrganizationAppearance,
                        handle: {
                          crumbs: [SETTINGS_CRUMB, TENANT_CRUMB, { label: 'Organizations', to: ROUTES.tenantOrganizations }, { label: 'Appearance', to: ROUTES.tenantOrganizations }],
                          page: { title: 'Organization appearance', description: 'Overrides for one organization of {tenant}. Anything not set here is inherited from {tenant}.' },
                        } satisfies RouteHandle,
                        ...appearancePage('TenantOrganizationAppearancePage'),
                      },
                      {
                        path: ROUTES.tenantMembers,
                        handle: settingsPage(TENANT_CRUMB, 'Members', ROUTES.tenantMembers, 'Tenant members', 'Tenant roles and organization access policies.'),
                        ...tenantSettings('TenantMembersPage'),
                      },
                      {
                        path: ROUTES.tenantActivity,
                        handle: settingsPage(TENANT_CRUMB, 'Activity', ROUTES.tenantActivity, 'Tenant activity', 'Everything changed in {tenant} and its organizations.'),
                        ...tenantSettings('TenantActivityPage'),
                      },
                      {
                        path: ROUTES.tenantTerms,
                        handle: settingsPage(TENANT_CRUMB, 'Terms of Service', ROUTES.tenantTerms, 'Terms of Service', 'Who in {tenant} has accepted its Terms of Service.'),
                        ...termsAcceptancePage('TenantTermsAcceptancePage'),
                      },
                      {
                        path: ROUTES.tenantAppearance,
                        handle: settingsPage(TENANT_CRUMB, 'Appearance', ROUTES.tenantAppearance, 'Tenant appearance', 'White-label look & feel for every organization of {tenant}, unless an organization overrides it.'),
                        ...appearancePage('TenantAppearancePage'),
                      },
                    ],
                  },
                  // Settings → Organization (selected Organization)
                  {
                    ...settingsLayout('OrganizationSettingsLayout'),
                    children: [
                      {
                        path: ROUTES.organizationSettings,
                        handle: settingsPage(ORGANIZATION_CRUMB, 'Details', ROUTES.organizationSettings, 'Organization', 'Details of the current organization and your access to it.'),
                        ...orgSettings('OrganizationDetailsPage'),
                      },
                      {
                        path: ROUTES.organizationMembers,
                        handle: settingsPage(ORGANIZATION_CRUMB, 'Members', ROUTES.organizationMembers, 'Members', 'People with a direct role in this organization.'),
                        ...orgSettings('OrganizationMembersPage'),
                      },
                      {
                        path: ROUTES.organizationAccess,
                        handle: settingsPage(ORGANIZATION_CRUMB, 'Permissions', ROUTES.organizationAccess, 'Permissions', 'Who reaches this organization, how, and with which effective permissions.'),
                        ...orgSettings('OrganizationAccessPage'),
                      },
                      {
                        path: ROUTES.organizationActivity,
                        handle: settingsPage(ORGANIZATION_CRUMB, 'Activity', ROUTES.organizationActivity, 'Activity', 'Changes made in this organization.'),
                        ...orgSettings('OrganizationActivityPage'),
                      },
                      {
                        path: ROUTES.organizationTerms,
                        handle: settingsPage(ORGANIZATION_CRUMB, 'Terms of Service', ROUTES.organizationTerms, 'Terms of Service', 'Who in this organization has accepted the Terms of Service of {tenant}.'),
                        ...termsAcceptancePage('OrganizationTermsAcceptancePage'),
                      },
                      {
                        path: ROUTES.organizationAppearance,
                        handle: settingsPage(ORGANIZATION_CRUMB, 'Appearance', ROUTES.organizationAppearance, 'Organization appearance', 'Overrides for this organization. Anything not set here is inherited from {tenant}.'),
                        ...appearancePage('OrganizationAppearancePage'),
                      },
                    ],
                  },
                  // Settings → Profile (signed-in user; not tied to a Tenant or Organization)
                  {
                    ...settingsLayout('ProfileSettingsLayout'),
                    children: [
                      {
                        path: ROUTES.profile,
                        handle: settingsPage(PROFILE_CRUMB, 'Personal information', ROUTES.profile, 'Personal information', 'The personal details of your NekkoGuard account.'),
                        ...page(async () => ({ Component: (await import('@/features/account/pages/ProfilePage')).ProfilePage })),
                      },
                      {
                        path: ROUTES.security,
                        handle: settingsPage(PROFILE_CRUMB, 'Security', ROUTES.security, 'Security', 'How you sign in and how your NekkoGuard account is protected.'),
                        ...page(async () => ({ Component: (await import('@/features/account/pages/SecurityPage')).SecurityPage })),
                      },
                      {
                        path: ROUTES.connectedApps,
                        handle: settingsPage(PROFILE_CRUMB, 'Connected applications', ROUTES.connectedApps, 'Connected applications', 'Applications that can use your NekkoGuard account to sign you in and read your profile.'),
                        ...page(async () => ({ Component: (await import('@/features/account/pages/ConnectedAppsPage')).ConnectedAppsPage })),
                      },
                    ],
                  },
                  // Software: release notes and terms (any signed-in user)
                  {
                    path: ROUTES.helpReleases,
                    handle: crumbs(SOFTWARE_CRUMB, { label: 'Release versions', to: ROUTES.helpReleases }),
                    ...page(async () => ({ Component: (await import('@/features/help/pages/ReleasesPage')).ReleasesPage })),
                  },
                  {
                    path: ROUTES.helpTerms,
                    handle: crumbs(SOFTWARE_CRUMB, { label: 'Terms of service', to: ROUTES.helpTerms }),
                    ...page(async () => ({ Component: (await import('@/features/terms/pages/TermsPage')).TermsPage })),
                  },
                  ...Object.entries(LEGACY_ACCOUNT_ROUTES).map(([path, to]) => ({ path, element: <LegacyRedirect to={to} /> })),
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
