from django.conf import settings
from django.urls import re_path
from rest_framework.routers import DefaultRouter
from rest_framework.routers import SimpleRouter

from nekkoguard.organizations.api import appearance
from nekkoguard.organizations.api import views as organizations
from nekkoguard.organizations.api.permissions import UUID_REGEX
from nekkoguard.support.api import terms as tos
from nekkoguard.support.api import views as support
from nekkoguard.users.api.views import UserViewSet

router = DefaultRouter() if settings.DEBUG else SimpleRouter()

router.register("users", UserViewSet)

# Multi-tenancy. Everything below a tenant/organization is scoped to the caller's
# standing — see nekkoguard/organizations/access.py and api/permissions.py.
TENANT = rf"tenants/(?P<tenant_pk>{UUID_REGEX})"
ORG = rf"{TENANT}/organizations/(?P<organization_pk>{UUID_REGEX})"

router.register("tenants", organizations.TenantViewSet, basename="tenant")
router.register(
    "organizations",
    organizations.MyOrganizationViewSet,
    basename="my-organization",
)
router.register(
    f"{TENANT}/members",
    organizations.TenantMemberViewSet,
    basename="tenant-member",
)
router.register(
    f"{TENANT}/activity",
    organizations.TenantActivityViewSet,
    basename="tenant-activity",
)
router.register(
    f"{TENANT}/organizations",
    organizations.TenantOrganizationViewSet,
    basename="organization",
)
router.register(
    f"{TENANT}/organizations",
    organizations.OrganizationDetailViewSet,
    basename="organization-detail",
)
router.register(
    f"{ORG}/members",
    organizations.OrganizationMemberViewSet,
    basename="organization-member",
)
router.register(
    f"{ORG}/invitations",
    organizations.OrganizationInvitationViewSet,
    basename="organization-invitation",
)
router.register(
    f"{ORG}/overrides",
    organizations.PermissionOverrideViewSet,
    basename="permission-override",
)
router.register(
    f"{ORG}/access",
    organizations.OrganizationAccessViewSet,
    basename="organization-access",
)
router.register(f"{ORG}/sites", organizations.SiteViewSet, basename="site")
router.register(f"{ORG}/networks", organizations.NetworkViewSet, basename="network")
router.register(
    f"{ORG}/activity",
    organizations.OrganizationActivityViewSet,
    basename="organization-activity",
)


# Invitation links (the token is the only secret; it is never stored in plain text).
INVITATION_KEY = r"(?P<token>[A-Za-z0-9_-]{20,128})"
invitation_urls = [
    re_path(
        rf"^invitations/{INVITATION_KEY}/$",
        organizations.InvitationLinkView.as_view(),
        name="invitation-link",
    ),
    re_path(
        rf"^invitations/{INVITATION_KEY}/accept/$",
        organizations.InvitationAcceptView.as_view(),
        name="invitation-accept",
    ),
]

# White-label appearance (branding only — never infrastructure access).
ASSET = r"(?P<asset>logo|favicon)"
appearance_urls = [
    re_path(
        rf"^{TENANT}/appearance/$",
        appearance.TenantAppearanceView.as_view(),
        name="tenant-appearance",
    ),
    re_path(
        rf"^{TENANT}/appearance/{ASSET}/$",
        appearance.TenantAppearanceAssetView.as_view(),
        name="tenant-appearance-asset",
    ),
    re_path(
        rf"^{ORG}/appearance/$",
        appearance.OrganizationAppearanceView.as_view(),
        name="organization-appearance",
    ),
    re_path(
        rf"^{ORG}/appearance/{ASSET}/$",
        appearance.OrganizationAppearanceAssetView.as_view(),
        name="organization-appearance-asset",
    ),
]

# Software: release notes and bug reports (any signed-in user).
support_urls = [
    re_path(r"^help/releases/$", support.ReleasesView.as_view(), name="help-releases"),
    re_path(r"^bug-reports/$", support.BugReportView.as_view(), name="bug-report"),
]

# Tenant Terms of Service. /api/terms/ stays reachable while acceptance is pending
# (support/middleware.py); everything under a Tenant is checked against the caller.
VERSION = rf"(?P<version_pk>{UUID_REGEX})"
terms_urls = [
    re_path(r"^terms/pending/$", tos.PendingTermsView.as_view(), name="terms-pending"),
    re_path(r"^terms/decline/$", tos.DeclineTermsView.as_view(), name="terms-decline"),
    re_path(
        rf"^terms/{VERSION}/accept/$",
        tos.AcceptTermsView.as_view(),
        name="terms-accept",
    ),
    re_path(rf"^{TENANT}/terms/$", tos.TenantTermsView.as_view(), name="tenant-terms"),
    re_path(
        rf"^{TENANT}/terms/history/$",
        tos.TermsHistoryView.as_view(),
        name="tenant-terms-history",
    ),
    re_path(
        rf"^{TENANT}/terms/history/{VERSION}/$",
        tos.TermsHistoryDetailView.as_view(),
        name="tenant-terms-history-version",
    ),
    re_path(
        rf"^{TENANT}/terms/versions/$",
        tos.TermsVersionListView.as_view(),
        name="tenant-terms-versions",
    ),
    re_path(
        rf"^{TENANT}/terms/versions/{VERSION}/$",
        tos.TermsVersionDetailView.as_view(),
        name="tenant-terms-version",
    ),
    re_path(
        rf"^{TENANT}/terms/versions/{VERSION}/publish/$",
        tos.PublishTermsView.as_view(),
        name="tenant-terms-publish",
    ),
    re_path(
        rf"^{TENANT}/terms/acceptances/$",
        tos.TermsAcceptanceListView.as_view(),
        name="tenant-terms-acceptances",
    ),
    re_path(
        rf"^{TENANT}/terms/summary/$",
        tos.TermsAcceptanceSummaryView.as_view(),
        name="tenant-terms-summary",
    ),
    re_path(
        rf"^{ORG}/terms/acceptances/$",
        tos.OrganizationTermsAcceptanceView.as_view(),
        name="organization-terms-acceptances",
    ),
    re_path(
        rf"^{ORG}/terms/summary/$",
        tos.OrganizationTermsSummaryView.as_view(),
        name="organization-terms-summary",
    ),
]

app_name = "api"
urlpatterns = (
    invitation_urls + appearance_urls + support_urls + terms_urls + router.urls
)
