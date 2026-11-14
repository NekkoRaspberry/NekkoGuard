from django.conf import settings
from rest_framework.routers import DefaultRouter
from rest_framework.routers import SimpleRouter

from nekkoguard.organizations.api import views as organizations
from nekkoguard.organizations.api.permissions import UUID_REGEX
from nekkoguard.users.api.views import UserViewSet

router = DefaultRouter() if settings.DEBUG else SimpleRouter()

router.register("users", UserViewSet)

# Multi-tenancy. Everything below a tenant/organization is scoped to the caller's
# standing — see nekkoguard/organizations/access.py and api/permissions.py.
TENANT = rf"tenants/(?P<tenant_pk>{UUID_REGEX})"
ORG = rf"{TENANT}/organizations/(?P<organization_pk>{UUID_REGEX})"

router.register("tenants", organizations.TenantViewSet, basename="tenant")
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
router.register(
    "platform/tenants",
    organizations.PlatformTenantViewSet,
    basename="platform-tenant",
)


app_name = "api"
urlpatterns = router.urls
