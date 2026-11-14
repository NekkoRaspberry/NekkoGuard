from __future__ import annotations

from typing import TYPE_CHECKING
from typing import Any

from django.contrib.auth import get_user_model
from django.utils.translation import gettext_lazy as _
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

# Imported at runtime: drf-spectacular evaluates the type hints below.
from nekkoguard.organizations.access import OrganizationContext  # noqa: TC001
from nekkoguard.organizations.models import ActivityEntry
from nekkoguard.organizations.models import MembershipStatus
from nekkoguard.organizations.models import Network
from nekkoguard.organizations.models import Organization
from nekkoguard.organizations.models import OrganizationMembership
from nekkoguard.organizations.models import PermissionOverride
from nekkoguard.organizations.models import Site
from nekkoguard.organizations.models import Tenant
from nekkoguard.organizations.models import TenantMembership
from nekkoguard.organizations.roles import PERMISSION_CHOICES
from nekkoguard.organizations.roles import Effect
from nekkoguard.organizations.roles import OrganizationAccess
from nekkoguard.organizations.roles import OrganizationRole
from nekkoguard.organizations.roles import TenantRole
from nekkoguard.organizations.roles import tenant_permissions_for

if TYPE_CHECKING:
    from django.db.models import Model
    from django.db.models import QuerySet


User = get_user_model()


def ensure_unique_name(
    queryset: QuerySet,
    name: str,
    instance: Model | None,
    message: str,
) -> None:
    """Case-insensitive uniqueness inside a parent (mirrors the DB constraints)."""
    if instance is not None:
        queryset = queryset.exclude(pk=instance.pk)
    if queryset.filter(name__iexact=name).exists():
        raise serializers.ValidationError({"name": [message]})


def find_active_user(email: str, *, field: str = "email"):
    user = User.objects.filter(email__iexact=email.strip(), is_active=True).first()
    if user is None:
        raise serializers.ValidationError(
            {
                field: [
                    _(
                        "No NekkoGuard account uses this email. "
                        "Ask them to sign up first.",
                    ),
                ],
            },
        )
    return user


class UserSummarySerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    email = serializers.EmailField(read_only=True)
    name = serializers.CharField(read_only=True)


# ---------------------------------------------------------------- tenants


class TenantSerializer(serializers.ModelSerializer[Tenant]):
    """A Tenant as seen by the caller (``role`` is null for Organization-only users)."""

    role = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()

    class Meta:
        model = Tenant
        fields = ["id", "name", "description", "role", "permissions", "created_at"]
        read_only_fields = ["id", "created_at"]

    def _membership(self, obj: Tenant) -> TenantMembership | None:
        return self.context.get("tenant_memberships", {}).get(obj.pk)

    def get_role(self, obj: Tenant) -> str | None:
        membership = self._membership(obj)
        return membership.role if membership else None

    @extend_schema_field(serializers.ListField(child=serializers.CharField()))
    def get_permissions(self, obj: Tenant) -> list[str]:
        membership = self._membership(obj)
        return sorted(tenant_permissions_for(membership.role)) if membership else []

    def validate_name(self, value: str) -> str:
        ensure_unique_name(
            Tenant.objects.all(),
            value,
            self.instance,
            _("A tenant with this name already exists."),
        )
        return value


class PlatformTenantSerializer(serializers.ModelSerializer[Tenant]):
    """Platform administrators: every Tenant, plus who owns it."""

    owner_email = serializers.EmailField(write_only=True, required=False)
    owners = serializers.SerializerMethodField()
    member_count = serializers.IntegerField(read_only=True, default=0)
    organization_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Tenant
        fields = [
            "id",
            "name",
            "description",
            "is_active",
            "owner_email",
            "owners",
            "member_count",
            "organization_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    @extend_schema_field(serializers.ListField(child=serializers.EmailField()))
    def get_owners(self, obj: Tenant) -> list[str]:
        return [
            m.user.email for m in obj.memberships.all() if m.role == TenantRole.OWNER
        ]

    def validate_name(self, value: str) -> str:
        ensure_unique_name(
            Tenant.objects.all(),
            value,
            self.instance,
            _("A tenant with this name already exists."),
        )
        return value

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if self.instance is None:
            email = attrs.pop("owner_email", None)
            if not email:
                raise serializers.ValidationError(
                    {"owner_email": [_("Choose the tenant's owner.")]},
                )
            attrs["owner"] = find_active_user(email, field="owner_email")
        elif "owner_email" in attrs:
            raise serializers.ValidationError(
                {"owner_email": [_("Change owners from the tenant's members.")]},
            )
        return attrs


# ---------------------------------------------------------------- tenant members


class TenantMembershipSerializer(serializers.ModelSerializer[TenantMembership]):
    user = UserSummarySerializer(read_only=True)
    selected_organizations = serializers.SerializerMethodField()

    class Meta:
        model = TenantMembership
        fields = [
            "id",
            "user",
            "role",
            "status",
            "organization_access",
            "default_organization_role",
            "selected_organizations",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    @extend_schema_field(serializers.ListField(child=serializers.UUIDField()))
    def get_selected_organizations(self, obj: TenantMembership) -> list[str]:
        return sorted(str(g.organization_id) for g in obj.organization_grants.all())


@extend_schema_field(OpenApiTypes.UUID)
class _TenantOrganizationsField(serializers.PrimaryKeyRelatedField):
    """Only Organizations of the URL Tenant are valid (others: 'does not exist')."""

    def get_queryset(self):
        return Organization.objects.filter(tenant=self.context["tenant"])


class TenantMembershipWriteSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=TenantRole.choices, required=False)
    status = serializers.ChoiceField(choices=MembershipStatus.choices, required=False)
    organization_access = serializers.ChoiceField(
        choices=OrganizationAccess.choices,
        required=False,
    )
    default_organization_role = serializers.ChoiceField(
        choices=[("", "—"), *OrganizationRole.choices],
        required=False,
    )
    selected_organizations = _TenantOrganizationsField(many=True, required=False)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if not attrs:
            raise serializers.ValidationError(_("Send at least one field to change."))
        return attrs


class TenantMembershipCreateSerializer(TenantMembershipWriteSerializer):
    email = serializers.EmailField()
    role = serializers.ChoiceField(choices=TenantRole.choices)
    status = None  # type: ignore[assignment]

    def validate_email(self, value: str):
        return find_active_user(value)


# ---------------------------------------------------------------- organizations


class OrganizationSerializer(serializers.ModelSerializer[Organization]):
    tenant = serializers.UUIDField(source="tenant_id", read_only=True)
    has_access = serializers.SerializerMethodField()

    class Meta:
        model = Organization
        fields = [
            "id",
            "tenant",
            "name",
            "description",
            "is_active",
            "has_access",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "tenant", "created_at", "updated_at"]

    def get_has_access(self, obj: Organization) -> bool:
        return obj.pk in self.context.get("accessible_ids", set())

    def validate_name(self, value: str) -> str:
        ensure_unique_name(
            Organization.objects.filter(tenant=self.context["tenant"]),
            value,
            self.instance,
            _("An organization with this name already exists in this tenant."),
        )
        return value


class DecisionSerializer(serializers.Serializer):
    permission = serializers.CharField()
    allowed = serializers.BooleanField()
    source = serializers.CharField()


class EffectiveAccessSerializer(serializers.Serializer):
    """How one user reaches one Organization and what they may do there."""

    user = UserSummarySerializer(read_only=True)
    via_tenant = serializers.BooleanField()
    organization_role = serializers.SerializerMethodField()
    inherited_role = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()
    decisions = serializers.SerializerMethodField()

    def get_organization_role(self, obj: OrganizationContext) -> str | None:
        return obj.membership.role if obj.membership else None

    def get_inherited_role(self, obj: OrganizationContext) -> str | None:
        if obj.via_tenant and obj.tenant_membership is not None:
            return obj.tenant_membership.default_organization_role
        return None

    @extend_schema_field(serializers.ListField(child=serializers.CharField()))
    def get_permissions(self, obj: OrganizationContext) -> list[str]:
        return sorted(obj.permissions)

    @extend_schema_field(DecisionSerializer(many=True))
    def get_decisions(self, obj: OrganizationContext) -> list[dict[str, Any]]:
        return [
            {"permission": d.permission.value, "allowed": d.allowed, "source": d.source}
            for d in obj.decisions.values()
        ]


class OrganizationDetailSerializer(OrganizationSerializer):
    """Detail view: adds the caller's own effective access (``null`` = none)."""

    my_access = serializers.SerializerMethodField()

    class Meta(OrganizationSerializer.Meta):
        fields = [*OrganizationSerializer.Meta.fields, "my_access"]

    def get_has_access(self, obj: Organization) -> bool:
        return self.context.get("organization_context") is not None

    @extend_schema_field(EffectiveAccessSerializer(allow_null=True))
    def get_my_access(self, obj: Organization) -> dict[str, Any] | None:
        context = self.context.get("organization_context")
        return EffectiveAccessSerializer(context).data if context else None


# ---------------------------------------------------------------- organization members


class OrganizationMembershipSerializer(
    serializers.ModelSerializer[OrganizationMembership],
):
    user = UserSummarySerializer(read_only=True)

    class Meta:
        model = OrganizationMembership
        fields = ["id", "user", "role", "status", "created_at", "updated_at"]
        read_only_fields = fields


class OrganizationMembershipCreateSerializer(serializers.Serializer):
    email = serializers.EmailField()
    role = serializers.ChoiceField(choices=OrganizationRole.choices)

    def validate_email(self, value: str):
        return find_active_user(value)


class OrganizationMembershipUpdateSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=OrganizationRole.choices, required=False)
    status = serializers.ChoiceField(choices=MembershipStatus.choices, required=False)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if not attrs:
            raise serializers.ValidationError(_("Send a role or a status."))
        return attrs


# ---------------------------------------------------------------- overrides


class PermissionOverrideSerializer(serializers.ModelSerializer[PermissionOverride]):
    user = UserSummarySerializer(read_only=True)

    class Meta:
        model = PermissionOverride
        fields = ["id", "user", "permission", "effect", "created_at", "updated_at"]
        read_only_fields = fields


class PermissionOverrideWriteSerializer(serializers.Serializer):
    """Upsert one override. To go back to INHERIT, delete the override."""

    user = serializers.IntegerField()
    permission = serializers.ChoiceField(choices=PERMISSION_CHOICES)
    effect = serializers.ChoiceField(choices=Effect.choices)

    def validate_user(self, value: int):
        user = User.objects.filter(pk=value, is_active=True).first()
        if user is None:
            raise serializers.ValidationError(_("Unknown user."))
        return user


class PermissionOverrideUpdateSerializer(serializers.Serializer):
    effect = serializers.ChoiceField(choices=Effect.choices)


# ---------------------------------------------------------------- infrastructure


class OrganizationScopedSerializer(serializers.ModelSerializer):
    """Gives access to the Organization resolved by the view (never from the body)."""

    @property
    def organization(self) -> Organization:
        return self.context["organization"]


class SiteSerializer(OrganizationScopedSerializer):
    # Annotated on reads; a row that was just created has none yet.
    network_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Site
        fields = [
            "id",
            "name",
            "description",
            "network_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_name(self, value: str) -> str:
        ensure_unique_name(
            self.organization.sites.all(),
            value,
            self.instance,
            _("A site with this name already exists."),
        )
        return value


class NetworkSerializer(OrganizationScopedSerializer):
    site = serializers.PrimaryKeyRelatedField(queryset=Site.objects.none())

    class Meta:
        model = Network
        fields = [
            "id",
            "site",
            "name",
            "cidr",
            "description",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        if "organization" in self.context:
            # Only this Organization's sites are valid parents: an id from another
            # Organization is rejected as "does not exist" (nothing is revealed).
            self.fields["site"].queryset = self.organization.sites.all()

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        # Re-check when either the name or the parent changes (moving keeps the name).
        if "site" in attrs or "name" in attrs:
            site = attrs.get("site", getattr(self.instance, "site", None))
            name = attrs.get("name", getattr(self.instance, "name", ""))
            if site is not None:
                ensure_unique_name(
                    site.networks.all(),
                    name,
                    self.instance,
                    _("A network with this name already exists at this site."),
                )
        return attrs


# ---------------------------------------------------------------- activity


class ActivityEntrySerializer(serializers.ModelSerializer[ActivityEntry]):
    organization = serializers.UUIDField(source="organization_id", read_only=True)

    class Meta:
        model = ActivityEntry
        fields = [
            "id",
            "organization",
            "actor_email",
            "action",
            "target_type",
            "target_id",
            "target_name",
            "details",
            "created_at",
        ]
        read_only_fields = fields
