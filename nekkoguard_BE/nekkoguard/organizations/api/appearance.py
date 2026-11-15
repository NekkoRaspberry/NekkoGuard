"""
White-label appearance APIs.

    /api/tenants/{t}/appearance/                               GET · PATCH · DELETE
    /api/tenants/{t}/appearance/{logo|favicon}/                GET · PUT · DELETE
    /api/tenants/{t}/organizations/{o}/appearance/             GET · PATCH · DELETE
    /api/tenants/{t}/organizations/{o}/appearance/{asset}/     GET · PUT · DELETE

Who may do what (the **Appearance Admin** capability):

- *Read* the effective appearance: anyone who can see the scope (members of the
  Tenant, users who reach the Organization, the Tenant's administrators and
  Platform Administrators). Others get 404, as everywhere else.
- *Change* a Tenant's appearance: ``tenant.appearance.manage`` (Tenant role) or a
  Platform Administrator.
- *Change* an Organization's appearance: ``organization.appearance.manage`` in that
  Organization, ``tenant.appearance.manage`` in its Tenant, or a Platform
  Administrator.

These rights only ever unlock these endpoints. They are not part of the
infrastructure permission checks, so an Appearance Admin gains no access to
sites, networks or any other Organization data.
"""

from __future__ import annotations

from functools import cached_property
from typing import TYPE_CHECKING
from typing import Any

from django.http import HttpResponse
from django.urls import reverse
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework.exceptions import NotFound
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser
from rest_framework.parsers import JSONParser
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import SAFE_METHODS
from rest_framework.permissions import BasePermission
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from nekkoguard.organizations import access
from nekkoguard.organizations import appearance
from nekkoguard.organizations.models import APPEARANCE_ASSETS
from nekkoguard.organizations.models import Organization
from nekkoguard.organizations.models import Tenant
from nekkoguard.organizations.roles import Permission
from nekkoguard.organizations.roles import TenantPermission
from nekkoguard.organizations.roles import is_platform_admin

from .permissions import TENANT_ADMINISTRATION
from .permissions import OrganizationScopedMixin
from .permissions import TenantScopedMixin

if TYPE_CHECKING:
    from rest_framework.request import Request


class AppearancePermission(BasePermission):
    """404 without standing, 403 for writes without the Appearance Admin right."""

    def has_permission(self, request: Request, view: Any) -> bool:
        if not view.can_view_appearance():
            raise NotFound
        if request.method in SAFE_METHODS:
            return True
        return view.can_manage_appearance()


class _AppearanceBase(APIView):
    permission_classes = [IsAuthenticated, AppearancePermission]

    @cached_property
    def is_platform_admin(self) -> bool:
        return is_platform_admin(self.request.user)

    # Implemented by the Tenant / Organization variants.
    def can_view_appearance(self) -> bool:
        raise NotImplementedError

    def can_manage_appearance(self) -> bool:
        raise NotImplementedError

    @property
    def scope(self) -> Tenant | Organization:
        raise NotImplementedError

    def base_url(self) -> str:
        raise NotImplementedError


#: (effective, this scope's row, what it inherits, URL of the inherited scope)
Resolved = appearance.ResolvedAppearance
Resolution = tuple[Resolved, Any, Resolved, str]


def _with_urls(resolved: appearance.ResolvedAppearance, base: str) -> dict[str, Any]:
    """Values plus versioned image URLs (the hash busts browser caches)."""
    values: dict[str, Any] = dict(resolved.values)
    for asset, ref in resolved.assets.items():
        values[f"{asset}_url"] = f"{base}{asset}/?v={ref.hash}" if ref.hash else None
    return values


class _TenantScope(TenantScopedMixin):
    """The URL Tenant. Visible to its members, to users reaching one of its
    Organizations (they inherit its branding) and to Platform Administrators."""

    is_platform_admin: bool

    def can_view_appearance(self) -> bool:
        if self.is_platform_admin or self.tenant_access is not None:
            return True
        return (
            access.visible_tenants(self.request.user).filter(pk=self.tenant.pk).exists()
        )

    def can_manage_appearance(self) -> bool:
        return self.is_platform_admin or (
            self.tenant_access is not None
            and self.tenant_access.can(TenantPermission.MANAGE_APPEARANCE)
        )

    @property
    def scope(self) -> Tenant:
        return self.tenant

    def base_url(self) -> str:
        return reverse("api:tenant-appearance", kwargs={"tenant_pk": self.tenant.pk})

    def resolved(self) -> Resolution:
        row = appearance.tenant_row(self.tenant)
        # A Tenant inherits from the NekkoGuard defaults only.
        return appearance.resolve(row), row, appearance.resolve(None), ""


class _OrganizationScope(OrganizationScopedMixin):
    """The URL Organization, only looked up inside the URL Tenant."""

    is_platform_admin: bool

    def can_view_appearance(self) -> bool:
        if self.is_platform_admin or self.organization_context is not None:
            return True
        tenant_access = self.tenant_access
        return tenant_access is not None and any(
            tenant_access.can(p)
            for p in (*TENANT_ADMINISTRATION, TenantPermission.MANAGE_APPEARANCE)
        )

    def can_manage_appearance(self) -> bool:
        if self.is_platform_admin:
            return True
        tenant_access = self.tenant_access
        if tenant_access is not None and tenant_access.can(
            TenantPermission.MANAGE_APPEARANCE,
        ):
            return True
        context = self.organization_context
        return context is not None and context.can(Permission.MANAGE_APPEARANCE)

    @property
    def scope(self) -> Organization:
        return self.organization

    def base_url(self) -> str:
        return reverse(
            "api:organization-appearance",
            kwargs={
                "tenant_pk": self.tenant.pk,
                "organization_pk": self.organization.pk,
            },
        )

    def resolved(self) -> Resolution:
        tenant_row = appearance.tenant_row(self.tenant)
        row = appearance.organization_row(self.organization)
        tenant_url = reverse(
            "api:tenant-appearance",
            kwargs={"tenant_pk": self.tenant.pk},
        )
        return (
            appearance.resolve(tenant_row, row),
            row,
            appearance.resolve(tenant_row),
            tenant_url,
        )


# ---------------------------------------------------------------- settings


class _AppearanceView(_AppearanceBase):
    parser_classes = [JSONParser]

    def payload(self) -> dict[str, Any]:
        resolved, row, parent, parent_url = self.resolved()  # type: ignore[attr-defined]
        return {
            "scope": "organization"
            if isinstance(self.scope, Organization)
            else "tenant",
            "configured": appearance.configured_values(row),
            # What each property falls back to when it is not configured here
            # (``None`` = the NekkoGuard default).
            "inherited": _with_urls(parent, parent_url),
            "effective": _with_urls(resolved, self.base_url()),
            "sources": {
                **resolved.sources,
                **{asset: ref.source for asset, ref in resolved.assets.items()},
            },
            "can_manage": self.can_manage_appearance(),
            "updated_at": row.updated_at if row else None,
        }

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        return Response(self.payload())

    @extend_schema(request=OpenApiTypes.OBJECT, responses=OpenApiTypes.OBJECT)
    def patch(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        values = appearance.clean_values(request.data)
        appearance.update_appearance(
            actor=request.user,
            scope=self.scope,
            values=values,
        )
        return Response(self.payload())

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def delete(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        appearance.reset_appearance(actor=request.user, scope=self.scope)
        return Response(self.payload())


class TenantAppearanceView(_TenantScope, _AppearanceView):
    pass


class OrganizationAppearanceView(_OrganizationScope, _AppearanceView):
    pass


# ---------------------------------------------------------------- images


#: Upload limit plus room for the multipart envelope.
MAX_REQUEST_BYTES = appearance.MAX_UPLOAD_BYTES + 64 * 1024


class _AssetView(_AppearanceBase):
    parser_classes = [MultiPartParser, FormParser]

    @property
    def asset(self) -> str:
        asset = self.kwargs["asset"]
        if asset not in APPEARANCE_ASSETS:  # also restricted by the URL pattern
            raise NotFound
        return asset

    @extend_schema(responses={(200, "image/png"): OpenApiTypes.BINARY})
    def get(self, request: Request, *args: Any, **kwargs: Any) -> HttpResponse:
        organization = self.scope if isinstance(self.scope, Organization) else None
        data = appearance.asset_bytes(self.tenant, organization, self.asset)  # type: ignore[attr-defined]
        if data is None:
            raise NotFound
        response = HttpResponse(data, content_type="image/png")
        response["X-Content-Type-Options"] = "nosniff"
        response["Content-Security-Policy"] = "default-src 'none'; sandbox"
        response["Content-Disposition"] = f'inline; filename="{self.asset}.png"'
        # The URL carries the content hash (?v=…): safe to cache, never shared.
        response["Cache-Control"] = "private, max-age=31536000, immutable"
        return response

    @extend_schema(
        request={
            "multipart/form-data": {
                "type": "object",
                "properties": {"file": {"type": "string", "format": "binary"}},
            },
        },
        responses=OpenApiTypes.OBJECT,
    )
    def put(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        # Refuse oversized bodies before parsing: Django would otherwise spool them
        # to a temporary file (needless disk/SD-card writes).
        try:
            length = int(request.META.get("CONTENT_LENGTH") or 0)
        except ValueError:
            length = 0
        if length > MAX_REQUEST_BYTES:
            raise ValidationError({"file": ["The image must be 1 MB or smaller."]})
        upload = request.FILES.get("file")
        if upload is None:
            raise ValidationError({"file": ["Choose an image to upload."]})
        image = appearance.process_image(upload, self.asset)
        appearance.set_asset(
            actor=request.user,
            scope=self.scope,
            asset=self.asset,
            image=image,
        )
        return Response({"hash": image.hash})

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def delete(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        appearance.remove_asset(actor=request.user, scope=self.scope, asset=self.asset)
        return Response({"hash": None})


class TenantAppearanceAssetView(_TenantScope, _AssetView):
    pass


class OrganizationAppearanceAssetView(_OrganizationScope, _AssetView):
    pass
