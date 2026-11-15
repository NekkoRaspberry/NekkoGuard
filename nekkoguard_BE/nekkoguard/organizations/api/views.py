"""
Tenant / Organization APIs. Isolation rules: see ``permissions.py`` and ``access.py``.

    /api/tenants/                                     tenants I can see (+ my role)
    /api/tenants/{t}/                                 details; tenant.manage edits
    /api/tenants/{t}/members/                         tenant memberships + access policy
    /api/tenants/{t}/activity/                        tenant audit trail
    /api/tenants/{t}/organizations/                   organizations (create: managers)
    /api/tenants/{t}/organizations/{o}/               details + my effective access
    /api/tenants/{t}/organizations/{o}/members/       direct organization memberships
    /api/tenants/{t}/organizations/{o}/overrides/     GRANT/DENY overrides
    /api/tenants/{t}/organizations/{o}/access/        everyone's effective permissions
    /api/tenants/{t}/organizations/{o}/sites/         sites
    /api/tenants/{t}/organizations/{o}/networks/      networks (?site=)
    /api/tenants/{t}/organizations/{o}/activity/      organization audit trail

Tenants are created and deactivated in Django admin only (no platform API).
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING
from typing import Any
from typing import ClassVar

from django.db.models import Count
from django.db.models import Q
from django.utils.translation import gettext_lazy as _
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter
from drf_spectacular.utils import extend_schema
from drf_spectacular.utils import extend_schema_view
from rest_framework import mixins
from rest_framework import status
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound
from rest_framework.exceptions import PermissionDenied
from rest_framework.exceptions import ValidationError
from rest_framework.filters import OrderingFilter
from rest_framework.filters import SearchFilter
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from nekkoguard.organizations import access
from nekkoguard.organizations import invitations
from nekkoguard.organizations import services
from nekkoguard.organizations.context import default_tenant_id
from nekkoguard.organizations.models import InvitationStatus
from nekkoguard.organizations.models import MembershipStatus
from nekkoguard.organizations.models import Network
from nekkoguard.organizations.models import Organization
from nekkoguard.organizations.models import OrganizationInvitation
from nekkoguard.organizations.models import OrganizationMembership
from nekkoguard.organizations.models import PermissionOverride
from nekkoguard.organizations.models import Site
from nekkoguard.organizations.models import Tenant
from nekkoguard.organizations.models import TenantMembership
from nekkoguard.organizations.roles import OrganizationAccess
from nekkoguard.organizations.roles import Permission
from nekkoguard.organizations.roles import TenantPermission
from nekkoguard.security.throttling import SensitiveThrottleMixin
from nekkoguard.users.frontend import frontend_url

from .permissions import SCOPED_PERMISSIONS
from .permissions import TENANT_ADMINISTRATION
from .permissions import UUID_REGEX
from .permissions import OrganizationScopedMixin
from .permissions import Requirement
from .permissions import TenantScopedMixin
from .serializers import ActivityEntrySerializer
from .serializers import AddMemberResultSerializer
from .serializers import EffectiveAccessSerializer
from .serializers import MyOrganizationSerializer
from .serializers import NetworkSerializer
from .serializers import OrganizationDetailSerializer
from .serializers import OrganizationInvitationSerializer
from .serializers import OrganizationMembershipCreateSerializer
from .serializers import OrganizationMembershipSerializer
from .serializers import OrganizationMembershipUpdateSerializer
from .serializers import OrganizationSerializer
from .serializers import PermissionOverrideSerializer
from .serializers import PermissionOverrideUpdateSerializer
from .serializers import PermissionOverrideWriteSerializer
from .serializers import SiteSerializer
from .serializers import TenantMembershipCreateSerializer
from .serializers import TenantMembershipSerializer
from .serializers import TenantMembershipWriteSerializer
from .serializers import TenantSerializer

if TYPE_CHECKING:
    from django.db.models import QuerySet
    from rest_framework.request import Request
    from rest_framework.serializers import BaseSerializer

TENANT_PARAM = OpenApiParameter("tenant_pk", str, OpenApiParameter.PATH)
ORG_PARAM = OpenApiParameter("organization_pk", str, OpenApiParameter.PATH)

# Managing who reaches an Organization: its own managers or Tenant member managers.
MANAGE_ACCESS: Requirement = (
    Permission.MANAGE_MEMBERS,
    TenantPermission.MANAGE_MEMBERS,
)

# Reading who reaches an Organization (members, invitations, permissions): every
# role holds members.view; Tenant member managers too. Changes need MANAGE_ACCESS.
VIEW_ACCESS: Requirement = (
    Permission.VIEW_MEMBERS,
    *MANAGE_ACCESS,
)


def _schema(*params: OpenApiParameter, **actions: Any) -> Any:
    """Document the URL parameters on every action the view actually has."""
    names = ["list", "retrieve", "create", "update", "partial_update", "destroy"]

    def decorate(view: type) -> type:
        schemas = {
            name: extend_schema(parameters=list(params))
            for name in names
            if hasattr(view, name)
        }
        return extend_schema_view(**{**schemas, **actions})(view)

    return decorate


class ActivityPagination(PageNumberPagination):
    page_size = 50


class ActivityOrdering(OrderingFilter):
    """
    ``?ordering=<field>`` or ``-<field>`` over an explicit allowlist (DRF drops any
    other field). The id is always the last key, so pages stay stable when several
    entries share a value. Scoping is untouched: it happens in ``get_queryset``.
    """

    def get_ordering(self, request, queryset, view):
        ordering = list(super().get_ordering(request, queryset, view) or [])
        if not any(f.lstrip("-") == "id" for f in ordering):
            descending = bool(ordering) and ordering[0].startswith("-")
            ordering.append("-id" if descending or not ordering else "id")
        return ordering


ACTIVITY_ORDERING = {
    "filter_backends": [ActivityOrdering],
    "ordering_fields": ["created_at", "actor_email", "action", "target_name"],
    "ordering": ["-created_at"],
}


# ---------------------------------------------------------------- tenants


class TenantViewSet(
    SensitiveThrottleMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Tenants I am a member of, or reach an Organization in."""

    throttle_scope = "admin_changes"

    serializer_class = TenantSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "patch", "head", "options"]
    lookup_value_regex = UUID_REGEX

    def get_queryset(self) -> QuerySet[Tenant]:
        return access.visible_tenants(self.request.user)

    def get_serializer_context(self) -> dict:
        context = super().get_serializer_context()
        if self.request.user.is_authenticated:
            context["tenant_memberships"] = {
                m.tenant_id: m
                for m in TenantMembership.objects.filter(
                    user=self.request.user,
                    status=MembershipStatus.ACTIVE,
                )
            }
            if self.action == "list":
                context["default_tenant_id"] = default_tenant_id(
                    self.request.user,
                    self.get_queryset(),
                )
        return context

    def update(self, request: Request, *args, **kwargs) -> Response:
        # Check before validating: non-managers learn nothing from validation errors.
        tenant_access = access.tenant_access_for(request, self.get_object())
        if tenant_access is not None and tenant_access.withheld_by_mfa(
            TenantPermission.MANAGE,
        ):
            access.raise_mfa_required()
        if tenant_access is None or not tenant_access.can(TenantPermission.MANAGE):
            raise PermissionDenied
        return super().update(request, *args, **kwargs)

    def perform_update(self, serializer: BaseSerializer) -> None:
        serializer.instance = services.update_tenant(
            actor=self.request.user,
            tenant=serializer.instance,
            **serializer.validated_data,
        )


class MyOrganizationViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """
    Every Organization the caller can open, across all their Tenants, grouped by
    Tenant name (the organization switcher). Same rule as ``get_organization_access``.
    """

    serializer_class = MyOrganizationSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self) -> QuerySet[Organization]:
        return (
            access.accessible_organizations(self.request.user)
            .select_related("tenant")
            .order_by("tenant__name", "name")
        )


@_schema(
    TENANT_PARAM,
    create=extend_schema(
        parameters=[TENANT_PARAM],
        request=TenantMembershipCreateSerializer,
    ),
    partial_update=extend_schema(
        parameters=[TENANT_PARAM],
        request=TenantMembershipWriteSerializer,
    ),
)
class TenantMemberViewSet(
    SensitiveThrottleMixin,
    TenantScopedMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """Tenant memberships, including each member's Organization access policy."""

    throttle_scope = "access_changes"

    serializer_class = TenantMembershipSerializer
    permission_classes = SCOPED_PERMISSIONS
    required_permissions: ClassVar[dict[str, Requirement]] = dict.fromkeys(
        ["list", "retrieve", "create", "partial_update", "destroy"],
        (TenantPermission.MANAGE_MEMBERS,),
    )
    lookup_value_regex = "[0-9]+"
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    filter_backends = [SearchFilter]
    search_fields = ["user__email", "user__name"]

    def get_queryset(self) -> QuerySet[TenantMembership]:
        if getattr(self, "swagger_fake_view", False):  # schema generation only
            return TenantMembership.objects.none()
        members = TenantMembership.objects.filter(tenant=self.tenant)
        actor = self.tenant_access
        if actor is not None and not actor.full_scope:
            # A scoped administrator sees the members that concern their
            # organizations (and those with no organization access yet).
            scope = actor.administered_organizations()
            concerns = (
                Q(pk=actor.membership.pk)
                | Q(organization_access=OrganizationAccess.NONE)
                | Q(
                    organization_access=OrganizationAccess.SELECTED,
                    organization_grants__isnull=True,
                )
                | Q(organization_grants__organization__in=scope.values("pk"))
            )
            if scope.exists():
                # "All organizations" includes theirs (shown, not manageable).
                concerns |= Q(organization_access=OrganizationAccess.ALL)
            members = members.filter(concerns).distinct()
        return members.select_related("user").prefetch_related("organization_grants")

    def get_serializer_context(self) -> dict:
        context = super().get_serializer_context()
        context["tenant_actor"] = self.tenant_access
        return context

    def create(self, request: Request, *args, **kwargs) -> Response:
        serializer = TenantMembershipCreateSerializer(
            data=request.data,
            context=self.get_serializer_context(),
        )
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        membership = services.add_tenant_member(
            actor=self.tenant_access,  # type: ignore[arg-type]
            user=data.pop("email"),
            **data,
        )
        return Response(
            TenantMembershipSerializer(
                membership,
                context=self.get_serializer_context(),
            ).data,
            status=status.HTTP_201_CREATED,
        )

    def partial_update(self, request: Request, *args, **kwargs) -> Response:
        serializer = TenantMembershipWriteSerializer(
            data=request.data,
            context=self.get_serializer_context(),
        )
        serializer.is_valid(raise_exception=True)
        membership = services.update_tenant_member(
            actor=self.tenant_access,  # type: ignore[arg-type]
            target=self.get_object(),
            **serializer.validated_data,
        )
        return Response(
            TenantMembershipSerializer(
                membership,
                context=self.get_serializer_context(),
            ).data,
        )

    def perform_destroy(self, instance: TenantMembership) -> None:
        services.remove_tenant_member(
            actor=self.tenant_access,  # type: ignore[arg-type]
            target=instance,
        )


@_schema(TENANT_PARAM)
class TenantActivityViewSet(
    TenantScopedMixin,
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = ActivityEntrySerializer
    permission_classes = SCOPED_PERMISSIONS
    required_permissions: ClassVar[dict[str, Requirement]] = {
        "list": (TenantPermission.VIEW_ACTIVITY,),
    }
    pagination_class = ActivityPagination
    filter_backends = ACTIVITY_ORDERING["filter_backends"]
    ordering_fields = ACTIVITY_ORDERING["ordering_fields"]
    ordering = ACTIVITY_ORDERING["ordering"]

    def get_queryset(self):
        actor = self.tenant_access
        if actor is not None and not actor.full_scope:
            # Scoped administrators: activity of their organizations only (tenant-wide
            # entries can concern organizations outside their scope).
            return self.tenant.activity.filter(
                organization__in=actor.administered_organizations(),
            )
        return self.tenant.activity.all()


# ---------------------------------------------------------------- organizations


@_schema(TENANT_PARAM)
class TenantOrganizationViewSet(
    SensitiveThrottleMixin,
    TenantScopedMixin,
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    """
    Organizations of one Tenant: those the caller reaches, plus — for Tenant
    organization managers — those in their organization scope (``can_administer``;
    ``has_access`` tells whether they also reach the infrastructure).
    """

    throttle_scope = "admin_changes"

    serializer_class = OrganizationSerializer
    permission_classes = SCOPED_PERMISSIONS
    required_permissions: ClassVar[dict[str, Requirement]] = {
        "list": (),  # visibility (below) is enough
        "create": (TenantPermission.MANAGE_ORGANIZATIONS,),
    }
    http_method_names = ["get", "post", "head", "options"]
    filter_backends = [SearchFilter]
    search_fields = ["name", "description"]

    def _accessible(self) -> QuerySet[Organization]:
        return access.accessible_organizations(self.request.user).filter(
            tenant=self.tenant,
        )

    def _is_manager(self) -> bool:
        return self.tenant_access is not None and self.tenant_access.can(
            TenantPermission.MANAGE_ORGANIZATIONS,
        )

    def ensure_visible(self) -> None:
        # Organization-only users also list their Organizations in this Tenant.
        if self.tenant_access is None and not self._accessible().exists():
            raise NotFound

    def satisfies(self, requirement: Requirement) -> bool:
        return requirement == () or super().satisfies(requirement)

    def _administered(self) -> QuerySet[Organization]:
        if not self._is_manager():
            return Organization.objects.none()
        return self.tenant_access.administered_organizations()  # type: ignore[union-attr]

    def get_queryset(self) -> QuerySet[Organization]:
        return self.tenant.organizations.filter(
            Q(pk__in=self._administered().values("pk"))
            | Q(pk__in=self._accessible().values("pk")),
        )

    def get_serializer_context(self) -> dict:
        context = super().get_serializer_context()
        context["accessible_ids"] = set(self._accessible().values_list("pk", flat=True))
        context["administered_ids"] = set(
            self._administered().values_list("pk", flat=True),
        )
        return context

    def perform_create(self, serializer: BaseSerializer) -> None:
        serializer.instance = services.create_organization(
            actor=self.tenant_access,  # type: ignore[arg-type]
            name=serializer.validated_data["name"],
            description=serializer.validated_data.get("description", ""),
        )


class _OrganizationViewSet(OrganizationScopedMixin, viewsets.GenericViewSet):
    permission_classes = SCOPED_PERMISSIONS


@_schema(TENANT_PARAM, ORG_PARAM)
class OrganizationDetailViewSet(
    SensitiveThrottleMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    _OrganizationViewSet,
):
    """One Organization, with the caller's effective permissions in ``my_access``."""

    throttle_scope = "admin_changes"

    serializer_class = OrganizationDetailSerializer
    http_method_names = ["get", "patch", "head", "options"]
    lookup_url_kwarg = "organization_pk"
    lookup_value_regex = UUID_REGEX
    required_permissions: ClassVar[dict[str, Requirement]] = {
        "retrieve": (),  # visibility is enough
        "partial_update": (
            Permission.MANAGE_ORGANIZATION,
            TenantPermission.MANAGE_ORGANIZATIONS,
        ),
    }

    def satisfies(self, requirement: Requirement) -> bool:
        return requirement == () or super().satisfies(requirement)

    def get_object(self) -> Organization:
        return self.organization

    def get_serializer_context(self) -> dict:
        context = super().get_serializer_context()
        context["organization_context"] = self.organization_context
        # Tenant rights here (only inside the caller's organization scope).
        context["can_administer"] = self.tenant_access is not None and any(
            self.tenant_access.can(p) for p in TENANT_ADMINISTRATION
        )
        organization_context = self.organization_context
        context["mfa_required"] = (
            self.tenant_access is not None and self.tenant_access.mfa_required
        ) or (organization_context is not None and organization_context.mfa_required)
        return context

    def perform_update(self, serializer: BaseSerializer) -> None:
        values = dict(serializer.validated_data)
        if "is_active" in values and not super().satisfies(
            (TenantPermission.MANAGE_ORGANIZATIONS,),
        ):
            raise PermissionDenied(_("Only tenant administrators can deactivate this."))
        serializer.instance = services.update_organization(
            actor=self.request.user,
            organization=self.organization,
            **values,
        )


@_schema(
    TENANT_PARAM,
    ORG_PARAM,
    create=extend_schema(
        parameters=[TENANT_PARAM, ORG_PARAM],
        request=OrganizationMembershipCreateSerializer,
    ),
    partial_update=extend_schema(
        parameters=[TENANT_PARAM, ORG_PARAM],
        request=OrganizationMembershipUpdateSerializer,
    ),
)
class OrganizationMemberViewSet(
    SensitiveThrottleMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    _OrganizationViewSet,
):
    """Direct Organization memberships. Role rules live in services.py."""

    serializer_class = OrganizationMembershipSerializer
    required_permissions: ClassVar[dict[str, Requirement]] = {
        "list": VIEW_ACCESS,
        "retrieve": VIEW_ACCESS,
        **dict.fromkeys(["create", "partial_update", "destroy"], MANAGE_ACCESS),
    }
    lookup_value_regex = "[0-9]+"
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    filter_backends = [SearchFilter]
    search_fields = ["user__email", "user__name"]

    def get_queryset(self) -> QuerySet[OrganizationMembership]:
        if getattr(self, "swagger_fake_view", False):  # schema generation only
            return OrganizationMembership.objects.none()
        return OrganizationMembership.objects.filter(
            organization=self.organization,
        ).select_related("user", "organization__tenant")

    def get_throttles(self):
        # Adding (which may email an invitation) vs changing / removing members.
        self.throttle_scope = (
            "member_invitations" if self.action == "create" else "access_changes"
        )
        return super().get_throttles()

    @extend_schema(
        request=OrganizationMembershipCreateSerializer,
        responses={201: AddMemberResultSerializer},
    )
    def create(self, request: Request, *args, **kwargs) -> Response:
        """Add by email: existing account → member (Viewer); otherwise → invitation."""
        serializer = OrganizationMembershipCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result, obj = invitations.add_or_invite(
            actor=self.actor,
            email=serializer.validated_data["email"],
            link_for=lambda token: invitation_link(request, token),
        )
        key = "membership" if result == "added" else "invitation"
        data = AddMemberResultSerializer({"result": result, key: obj}).data
        return Response(data, status=status.HTTP_201_CREATED)

    def partial_update(self, request: Request, *args, **kwargs) -> Response:
        serializer = OrganizationMembershipUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        membership = services.update_organization_member(
            actor=self.actor,
            target=self.get_object(),
            **serializer.validated_data,
        )
        return Response(OrganizationMembershipSerializer(membership).data)

    def perform_destroy(self, instance: OrganizationMembership) -> None:
        services.remove_organization_member(actor=self.actor, target=instance)


def invitation_link(request: Request, token: str) -> str:
    """Frontend page of an invitation (the only place the plain token appears)."""
    return frontend_url(request, f"invitations/{token}")


@_schema(TENANT_PARAM, ORG_PARAM)
class OrganizationInvitationViewSet(
    SensitiveThrottleMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.DestroyModelMixin,
    _OrganizationViewSet,
):
    """
    Invitations of this Organization. DELETE revokes (the row is kept for the
    record); ``resend/`` rotates the token and restarts the expiry period.
    """

    serializer_class = OrganizationInvitationSerializer
    required_permissions: ClassVar[dict[str, Requirement]] = {
        "list": VIEW_ACCESS,
        "retrieve": VIEW_ACCESS,
        **dict.fromkeys(["destroy", "resend"], MANAGE_ACCESS),
    }
    lookup_value_regex = UUID_REGEX
    http_method_names = ["get", "post", "delete", "head", "options"]

    def get_queryset(self) -> QuerySet[OrganizationInvitation]:
        if getattr(self, "swagger_fake_view", False):  # schema generation only
            return OrganizationInvitation.objects.none()
        # Accepted and revoked invitations are history (see Activity).
        return OrganizationInvitation.objects.filter(
            organization=self.organization,
            status__in=[InvitationStatus.PENDING, InvitationStatus.EXPIRED],
        ).select_related("invited_by")

    def get_throttles(self):
        self.throttle_scope = (
            "member_invitations" if self.action == "resend" else "access_changes"
        )
        return super().get_throttles()

    def perform_destroy(self, instance: OrganizationInvitation) -> None:
        invitations.revoke_invitation(actor=self.actor, invitation=instance)

    @extend_schema(
        parameters=[TENANT_PARAM, ORG_PARAM],
        request=None,
        responses=OrganizationInvitationSerializer,
    )
    @action(detail=True, methods=["post"])
    def resend(self, request: Request, *args, **kwargs) -> Response:
        invitation = invitations.resend_invitation(
            actor=self.actor,
            invitation=self.get_object(),
            link_for=lambda token: invitation_link(request, token),
        )
        return Response(OrganizationInvitationSerializer(invitation).data)


class InvitationLinkView(SensitiveThrottleMixin, APIView):
    """
    GET /api/invitations/{token}/ — public: what the emailed link is about. Only a
    pending invitation reveals its Organization and inviter; any other state
    answers with its status only. Unknown tokens: 404.
    """

    permission_classes = [AllowAny]
    throttle_scope = "invitation_links"
    sensitive_methods = None  # anonymous lookups of secret links: always limited

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request: Request, token: str) -> Response:
        invitation = invitations.find_by_token(token)
        if invitation is None:
            raise NotFound(_("This invitation does not exist."))
        state = invitations.effective_status(invitation)
        organization = invitation.organization
        if state != InvitationStatus.PENDING or not (
            organization.is_active and organization.tenant.is_active
        ):
            unavailable = state == InvitationStatus.PENDING
            return Response({"status": "unavailable" if unavailable else state})
        return Response(
            {
                "status": state,
                "email": invitation.email,
                "organization_name": organization.name,
                "invited_by": invitations._display_name(invitation.invited_by),  # noqa: SLF001
                "role": invitation.role,
                "expires_at": invitation.expires_at,
            },
        )


class InvitationAcceptView(SensitiveThrottleMixin, APIView):
    """POST /api/invitations/{token}/accept/ — by the owner of the invited address."""

    permission_classes = [IsAuthenticated]
    throttle_scope = "invitation_links"

    @extend_schema(request=None, responses=OpenApiTypes.OBJECT)
    def post(self, request: Request, token: str) -> Response:
        invitation, already_member = invitations.accept_invitation(
            token=token,
            user=request.user,  # type: ignore[arg-type]
        )
        organization = invitation.organization
        return Response(
            {
                "tenant": str(organization.tenant_id),
                "organization": str(organization.pk),
                "organization_name": organization.name,
                "already_member": already_member,
            },
        )


@_schema(
    TENANT_PARAM,
    ORG_PARAM,
    create=extend_schema(
        parameters=[TENANT_PARAM, ORG_PARAM],
        request=PermissionOverrideWriteSerializer,
    ),
    partial_update=extend_schema(
        parameters=[TENANT_PARAM, ORG_PARAM],
        request=PermissionOverrideUpdateSerializer,
    ),
)
class PermissionOverrideViewSet(
    SensitiveThrottleMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    _OrganizationViewSet,
):
    """Explicit GRANT/DENY per user. POST upserts; DELETE returns to INHERIT."""

    throttle_scope = "access_changes"

    serializer_class = PermissionOverrideSerializer
    required_permissions: ClassVar[dict[str, Requirement]] = {
        "list": VIEW_ACCESS,
        "retrieve": VIEW_ACCESS,
        **dict.fromkeys(["create", "partial_update", "destroy"], MANAGE_ACCESS),
    }
    lookup_value_regex = "[0-9]+"
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self) -> QuerySet[PermissionOverride]:
        if getattr(self, "swagger_fake_view", False):  # schema generation only
            return PermissionOverride.objects.none()
        return PermissionOverride.objects.filter(
            organization=self.organization,
        ).select_related("user")

    def create(self, request: Request, *args, **kwargs) -> Response:
        serializer = PermissionOverrideWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        override = services.set_permission_override(
            actor=self.actor,
            **serializer.validated_data,
        )
        return Response(
            PermissionOverrideSerializer(override).data,
            status=status.HTTP_201_CREATED,
        )

    def partial_update(self, request: Request, *args, **kwargs) -> Response:
        serializer = PermissionOverrideUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        target = self.get_object()
        override = services.set_permission_override(
            actor=self.actor,
            user=target.user,
            permission=target.permission,
            effect=serializer.validated_data["effect"],
        )
        return Response(PermissionOverrideSerializer(override).data)

    def perform_destroy(self, instance: PermissionOverride) -> None:
        services.remove_permission_override(actor=self.actor, override=instance)


@_schema(TENANT_PARAM, ORG_PARAM)
class OrganizationAccessViewSet(mixins.ListModelMixin, _OrganizationViewSet):
    """Everyone who reaches the Organization, with the source of each permission."""

    serializer_class = EffectiveAccessSerializer
    required_permissions: ClassVar[dict[str, Requirement]] = {"list": VIEW_ACCESS}

    def list(self, request: Request, *args, **kwargs) -> Response:
        contexts = access.organization_access_list(self.organization)
        return Response(self.get_serializer(contexts, many=True).data)


# ---------------------------------------------------------------- infrastructure


class InfrastructureViewSet(_OrganizationViewSet, viewsets.ModelViewSet):
    """CRUD with an audit entry for every change."""

    filter_backends = [SearchFilter]
    search_fields = ["name", "description"]

    def _record(self, action: str, instance) -> None:
        services.record_activity(
            tenant=self.tenant,
            organization=self.organization,
            actor=self.request.user,
            action=f"{instance._meta.model_name}.{action}",  # noqa: SLF001
            target=instance,
        )

    def perform_create(self, serializer: BaseSerializer) -> None:
        self._record("created", self._save_new(serializer))

    def _save_new(self, serializer: BaseSerializer):
        return serializer.save()

    def perform_update(self, serializer: BaseSerializer) -> None:
        self._record("updated", serializer.save())

    def perform_destroy(self, instance) -> None:
        self._record("deleted", instance)
        instance.delete()


def _crud(view: Permission, manage: Permission) -> dict[str, Requirement]:
    return {
        "list": (view,),
        "retrieve": (view,),
        "create": (manage,),
        "update": (manage,),
        "partial_update": (manage,),
        "destroy": (manage,),
    }


@_schema(TENANT_PARAM, ORG_PARAM)
class SiteViewSet(InfrastructureViewSet):
    serializer_class = SiteSerializer
    required_permissions: ClassVar[dict[str, Requirement]] = _crud(
        Permission.VIEW_SITES,
        Permission.MANAGE_SITES,
    )
    lookup_value_regex = UUID_REGEX

    def get_queryset(self) -> QuerySet[Site]:
        return self.organization.sites.annotate(network_count=Count("networks"))

    def _save_new(self, serializer: BaseSerializer):
        # The Organization always comes from the URL, never the body.
        return serializer.save(organization=self.organization)


@_schema(
    TENANT_PARAM,
    ORG_PARAM,
    list=extend_schema(
        parameters=[
            TENANT_PARAM,
            ORG_PARAM,
            OpenApiParameter("site", str, description="Site id"),
        ],
    ),
)
class NetworkViewSet(InfrastructureViewSet):
    serializer_class = NetworkSerializer
    required_permissions: ClassVar[dict[str, Requirement]] = _crud(
        Permission.VIEW_NETWORKS,
        Permission.MANAGE_NETWORKS,
    )
    search_fields = ["name", "description", "cidr"]
    lookup_value_regex = UUID_REGEX

    def get_queryset(self) -> QuerySet[Network]:
        queryset = Network.objects.filter(
            site__organization=self.organization,
        ).select_related("site")
        site = self.request.query_params.get("site")
        if self.action == "list" and site:
            if (
                not Site.objects.filter(organization=self.organization)
                .filter(
                    pk__in=[site] if _is_uuid(site) else [],
                )
                .exists()
            ):
                raise ValidationError({"site": ["Unknown site."]})
            queryset = queryset.filter(site_id=site)
        return queryset


def _is_uuid(value: str) -> bool:
    try:
        uuid.UUID(value)
    except ValueError:
        return False
    return True


@_schema(TENANT_PARAM, ORG_PARAM)
class OrganizationActivityViewSet(mixins.ListModelMixin, _OrganizationViewSet):
    serializer_class = ActivityEntrySerializer
    required_permissions: ClassVar[dict[str, Requirement]] = {
        "list": (Permission.VIEW_ACTIVITY, TenantPermission.VIEW_ACTIVITY),
    }
    pagination_class = ActivityPagination
    filter_backends = ACTIVITY_ORDERING["filter_backends"]
    ordering_fields = ACTIVITY_ORDERING["ordering_fields"]
    ordering = ACTIVITY_ORDERING["ordering"]

    def get_queryset(self):
        return self.organization.activity.all()
