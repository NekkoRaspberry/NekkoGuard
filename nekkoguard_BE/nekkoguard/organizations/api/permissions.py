"""
Request scoping for every view under ``/api/tenants/<tenant_pk>/…``.

How a request is checked:

1. Ids in the URL are never trusted. The Tenant / Organization is looked up and the
   caller's standing is resolved by ``organizations.access``. Organizations are only
   found inside the Tenant named in the URL (no cross-Tenant parent mix-ups).
2. A caller with no standing at all gets **404**: the resource's existence is not
   revealed.
3. Each view action names the permissions it needs (any one of them is enough).
   ``Permission`` values are checked against the effective Organization
   permissions, ``TenantPermission`` values against the Tenant role. A caller who
   can see the resource but lacks the permission gets **403**.
4. Querysets are always built from the resolved Tenant/Organization — never from
   ids in the query string or body.
"""

from __future__ import annotations

import uuid
from functools import cached_property
from typing import TYPE_CHECKING
from typing import ClassVar

from rest_framework.exceptions import NotFound
from rest_framework.permissions import BasePermission
from rest_framework.permissions import IsAuthenticated

from nekkoguard.organizations import access
from nekkoguard.organizations.models import Organization
from nekkoguard.organizations.models import Tenant
from nekkoguard.organizations.roles import Permission
from nekkoguard.organizations.roles import TenantPermission
from nekkoguard.organizations.roles import is_platform_admin
from nekkoguard.organizations.services import OrganizationActor

if TYPE_CHECKING:
    from rest_framework.request import Request
    from rest_framework.views import APIView

UUID_REGEX = (
    r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
)

AnyPermission = Permission | TenantPermission
Requirement = tuple[AnyPermission, ...]

# Administrators of the Tenant may see an Organization (to manage it) without
# reaching its infrastructure.
TENANT_ADMINISTRATION = (
    TenantPermission.MANAGE_ORGANIZATIONS,
    TenantPermission.MANAGE_MEMBERS,
)


def _uuid_or_404(value: str) -> uuid.UUID:
    """Malformed ids are simply 'not found' (never a server error)."""
    try:
        return uuid.UUID(str(value))
    except ValueError:
        raise NotFound from None


class TenantScopedMixin:
    """Resolves the URL Tenant and the caller's Tenant standing once per request."""

    tenant_url_kwarg: ClassVar[str] = "tenant_pk"
    #: Permissions per viewset action (any one suffices). Unlisted actions: refused.
    required_permissions: ClassVar[dict[str, Requirement]] = {}

    request: Request
    kwargs: dict
    action: str | None

    @cached_property
    def tenant(self) -> Tenant:
        tenant = Tenant.objects.filter(
            pk=_uuid_or_404(self.kwargs[self.tenant_url_kwarg]),
            is_active=True,
        ).first()
        if tenant is None:
            raise NotFound
        return tenant

    @cached_property
    def tenant_access(self) -> access.TenantAccess | None:
        return access.get_tenant_access(self.request.user, self.tenant)

    def ensure_visible(self) -> None:
        if self.tenant_access is None:
            raise NotFound

    def satisfies(self, requirement: Requirement) -> bool:
        tenant_access = self.tenant_access
        return any(
            isinstance(p, TenantPermission)
            and tenant_access is not None
            and tenant_access.can(p)
            for p in requirement
        )

    def get_serializer_context(self) -> dict:
        context = super().get_serializer_context()  # type: ignore[misc]
        context["tenant"] = self.tenant
        return context


class OrganizationScopedMixin(TenantScopedMixin):
    """Adds the URL Organization (inside the URL Tenant) and the caller's context."""

    organization_url_kwarg: ClassVar[str] = "organization_pk"

    @cached_property
    def organization(self) -> Organization:
        organization = (
            Organization.objects.select_related("tenant")
            .filter(
                pk=_uuid_or_404(self.kwargs[self.organization_url_kwarg]),
                tenant=self.tenant,
            )
            .first()
        )
        if organization is None:
            raise NotFound
        return organization

    @cached_property
    def organization_context(self) -> access.OrganizationContext | None:
        return access.get_organization_access(self.request.user, self.organization)

    @cached_property
    def actor(self) -> OrganizationActor:
        return OrganizationActor(
            user=self.request.user,  # type: ignore[arg-type]
            organization=self.organization,
            tenant_access=self.tenant_access,
            context=self.organization_context,
        )

    def ensure_visible(self) -> None:
        if self.organization_context is not None:
            return
        if super().satisfies(TENANT_ADMINISTRATION):
            return
        raise NotFound

    def satisfies(self, requirement: Requirement) -> bool:
        context = self.organization_context
        organization_ok = any(
            isinstance(p, Permission) and context is not None and context.can(p)
            for p in requirement
        )
        return organization_ok or super().satisfies(requirement)

    def get_serializer_context(self) -> dict:
        context = super().get_serializer_context()
        context["organization"] = self.organization
        return context


class HasScopedPermission(BasePermission):
    """Use with views based on ``TenantScopedMixin`` / ``OrganizationScopedMixin``."""

    def has_permission(self, request: Request, view: APIView) -> bool:
        assert isinstance(view, TenantScopedMixin)
        view.ensure_visible()  # 404 for callers with no standing
        if view.action is None:
            # Method not routed (or OPTIONS): DRF answers 405 / metadata. Nothing is
            # read or changed, and only callers with standing get this far.
            return True
        requirement = view.required_permissions.get(view.action)
        return requirement is not None and view.satisfies(requirement)


class IsPlatformAdmin(BasePermission):
    message = "Only platform administrators can do this."

    def has_permission(self, request: Request, view: APIView) -> bool:
        return is_platform_admin(request.user)


SCOPED_PERMISSIONS = [IsAuthenticated, HasScopedPermission]
PLATFORM_PERMISSIONS = [IsAuthenticated, IsPlatformAdmin]
