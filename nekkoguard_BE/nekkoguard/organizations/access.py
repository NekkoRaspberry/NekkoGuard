"""
The access resolver: the only place that decides who reaches what.

Three separate decisions — never collapse them:

1. **Tenant administration** — ``get_tenant_access()``. Comes only from an active
   ``TenantMembership`` role.
2. **Organization access** — ``get_organization_access()`` returns ``None`` when
   the user does not reach the Organization. A user reaches it through an active
   direct ``OrganizationMembership`` or through their Tenant membership's
   organization access policy (``all`` / ``selected``).
3. **Permission to operate** — ``OrganizationContext.can()``. Per permission:

   1. an explicit ``PermissionOverride`` (GRANT/DENY) decides;
   2. otherwise the direct Organization role grants it if it includes it;
   3. otherwise the Tenant membership's default organization role grants it, but
      only when access comes through the Tenant;
   4. otherwise it is denied (never an implicit grant).

Non-overridable restrictions, checked before anything else:

- inactive user, inactive Tenant or inactive Organization → no access;
- a **suspended Tenant membership** blocks the user in the whole Tenant (Tenant
  administration and every Organization, even with a direct membership);
- a **suspended Organization membership** blocks that Organization, even when the
  Tenant policy would reach it.

``accessible_organizations()`` expresses rule 2 as a queryset for listings. The
test-suite checks that both implementations always agree.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import TYPE_CHECKING

from django.db.models import Exists
from django.db.models import OuterRef
from django.db.models import Q

from .models import MembershipStatus
from .models import Organization
from .models import OrganizationMembership
from .models import PermissionOverride
from .models import Tenant
from .models import TenantMembership
from .models import TenantOrganizationAccess
from .roles import Effect
from .roles import OrganizationAccess
from .roles import Permission
from .roles import TenantPermission
from .roles import organization_permissions_for
from .roles import tenant_permissions_for

if TYPE_CHECKING:
    from collections.abc import Mapping

    from django.contrib.auth.models import AbstractBaseUser
    from django.contrib.auth.models import AnonymousUser
    from django.db.models import QuerySet

    AnyUser = AbstractBaseUser | AnonymousUser


class Source(StrEnum):
    """Where an effective permission comes from (shown in the management UI)."""

    OVERRIDE = "override"
    ORGANIZATION_ROLE = "organization_role"
    TENANT_ROLE = "tenant_role"
    NONE = "none"


@dataclass(frozen=True)
class Decision:
    permission: Permission
    allowed: bool
    source: Source


@dataclass(frozen=True)
class TenantAccess:
    tenant: Tenant
    membership: TenantMembership
    permissions: frozenset[TenantPermission]

    def can(self, permission: TenantPermission) -> bool:
        return permission in self.permissions


@dataclass(frozen=True)
class OrganizationContext:
    user: AbstractBaseUser
    organization: Organization
    #: Active Tenant membership in the Organization's Tenant (whether or not its
    #: policy reaches this Organization).
    tenant_membership: TenantMembership | None
    #: Active direct membership, if any.
    membership: OrganizationMembership | None
    #: True when the Tenant membership's policy reaches this Organization.
    via_tenant: bool
    decisions: dict[Permission, Decision]

    def can(self, permission: Permission) -> bool:
        return self.decisions[permission].allowed

    @property
    def permissions(self) -> frozenset[Permission]:
        return frozenset(p for p, d in self.decisions.items() if d.allowed)

    @property
    def roles(self) -> frozenset[str]:
        """Organization roles in effect here (direct and/or inherited)."""
        roles = set()
        if self.membership is not None:
            roles.add(self.membership.role)
        if self.via_tenant and self.tenant_membership is not None:
            roles.add(self.tenant_membership.default_organization_role)
        return frozenset(roles)


def _user_ok(user: AnyUser) -> bool:
    return bool(user.is_authenticated and user.is_active)


# ---------------------------------------------------------------- decision 1


def get_tenant_access(user: AnyUser, tenant: Tenant) -> TenantAccess | None:
    if not _user_ok(user) or not tenant.is_active:
        return None
    membership = TenantMembership.objects.filter(
        tenant=tenant,
        user=user,
        status=MembershipStatus.ACTIVE,
    ).first()
    if membership is None:
        return None
    return TenantAccess(
        tenant=tenant,
        membership=membership,
        permissions=tenant_permissions_for(membership.role),
    )


# ---------------------------------------------------------------- decisions 2 + 3


def reaches_through_tenant(
    membership: TenantMembership,
    organization: Organization,
) -> bool:
    """Does this (active) Tenant membership's policy reach the Organization?"""
    if membership.tenant_id != organization.tenant_id:
        return False
    if membership.organization_access == OrganizationAccess.ALL:
        return True
    if membership.organization_access == OrganizationAccess.SELECTED:
        return membership.organization_grants.filter(
            organization=organization,
        ).exists()
    return False


def build_context(  # noqa: PLR0913
    *,
    user: AbstractBaseUser,
    organization: Organization,
    tenant_membership: TenantMembership | None,
    membership: OrganizationMembership | None,
    via_tenant: bool,
    overrides: Mapping[str, str],
) -> OrganizationContext:
    """Pure permission resolution (no queries). Callers decide access first."""
    direct = organization_permissions_for(membership.role if membership else None)
    inherited = (
        organization_permissions_for(tenant_membership.default_organization_role)
        if via_tenant and tenant_membership is not None
        else frozenset()
    )
    decisions: dict[Permission, Decision] = {}
    for permission in Permission:
        effect = overrides.get(permission.value)
        if effect is not None:
            decision = Decision(permission, effect == Effect.GRANT, Source.OVERRIDE)
        elif permission in direct:
            decision = Decision(permission, True, Source.ORGANIZATION_ROLE)  # noqa: FBT003
        elif permission in inherited:
            decision = Decision(permission, True, Source.TENANT_ROLE)  # noqa: FBT003
        else:
            decision = Decision(permission, False, Source.NONE)  # noqa: FBT003
        decisions[permission] = decision
    return OrganizationContext(
        user=user,
        organization=organization,
        tenant_membership=tenant_membership,
        membership=membership,
        via_tenant=via_tenant,
        decisions=decisions,
    )


def get_organization_access(
    user: AnyUser,
    organization: Organization,
) -> OrganizationContext | None:
    """``None`` means the user does not reach this Organization at all."""
    if not _user_ok(user):
        return None
    if not organization.is_active or not organization.tenant.is_active:
        return None
    tenant_membership = TenantMembership.objects.filter(
        tenant_id=organization.tenant_id,
        user=user,
    ).first()
    if tenant_membership is not None and not tenant_membership.is_active:
        return None  # suspended in the Tenant: blocked everywhere in it
    membership = OrganizationMembership.objects.filter(
        organization=organization,
        user=user,
    ).first()
    if membership is not None and not membership.is_active:
        return None  # suspended in this Organization
    via_tenant = tenant_membership is not None and reaches_through_tenant(
        tenant_membership,
        organization,
    )
    if membership is None and not via_tenant:
        return None
    overrides = dict(
        PermissionOverride.objects.filter(
            organization=organization,
            user=user,
        ).values_list("permission", "effect"),
    )
    return build_context(
        user=user,  # type: ignore[arg-type]
        organization=organization,
        tenant_membership=tenant_membership,
        membership=membership,
        via_tenant=via_tenant,
        overrides=overrides,
    )


def resolve_permission(
    user: AnyUser,
    organization: Organization,
    permission: Permission,
) -> bool:
    """Convenience for services and background tasks: one yes/no answer."""
    context = get_organization_access(user, organization)
    return context is not None and context.can(permission)


# ---------------------------------------------------------------- listings


def accessible_organizations(user: AnyUser) -> QuerySet[Organization]:
    """Organizations ``get_organization_access()`` would let the user reach."""
    if not _user_ok(user):
        return Organization.objects.none()
    active = MembershipStatus.ACTIVE
    direct = OrganizationMembership.objects.filter(
        organization=OuterRef("pk"),
        user=user,
        status=active,
    )
    through_all = TenantMembership.objects.filter(
        tenant=OuterRef("tenant"),
        user=user,
        status=active,
        organization_access=OrganizationAccess.ALL,
    )
    through_selected = TenantOrganizationAccess.objects.filter(
        organization=OuterRef("pk"),
        membership__tenant=OuterRef("tenant"),
        membership__user=user,
        membership__status=active,
        membership__organization_access=OrganizationAccess.SELECTED,
    )
    suspended_here = OrganizationMembership.objects.filter(
        organization=OuterRef("pk"),
        user=user,
    ).exclude(status=active)
    suspended_in_tenant = TenantMembership.objects.filter(
        tenant=OuterRef("tenant"),
        user=user,
    ).exclude(status=active)
    return (
        Organization.objects.filter(is_active=True, tenant__is_active=True)
        .filter(Exists(direct) | Exists(through_all) | Exists(through_selected))
        .exclude(Exists(suspended_here))
        .exclude(Exists(suspended_in_tenant))
    )


def visible_tenants(user: AnyUser) -> QuerySet[Tenant]:
    """Tenants the user is an active member of, or reaches an Organization in."""
    if not _user_ok(user):
        return Tenant.objects.none()
    member = TenantMembership.objects.filter(
        tenant=OuterRef("pk"),
        user=user,
        status=MembershipStatus.ACTIVE,
    )
    reached = accessible_organizations(user).filter(tenant=OuterRef("pk"))
    return Tenant.objects.filter(is_active=True).filter(
        Q(Exists(member)) | Q(Exists(reached)),
    )


def organization_access_list(organization: Organization) -> list[OrganizationContext]:
    """Everyone who reaches the Organization, with effective permissions (admin UI)."""
    tenant_memberships = {
        m.user_id: m
        for m in TenantMembership.objects.filter(
            tenant_id=organization.tenant_id,
        ).select_related("user")
    }
    memberships = {
        m.user_id: m
        for m in OrganizationMembership.objects.filter(
            organization=organization,
        ).select_related("user")
    }
    selected = set(
        TenantOrganizationAccess.objects.filter(
            organization=organization,
        ).values_list("membership_id", flat=True),
    )
    overrides: dict[int, dict[str, str]] = {}
    for user_id, permission, effect in PermissionOverride.objects.filter(
        organization=organization,
    ).values_list("user_id", "permission", "effect"):
        overrides.setdefault(user_id, {})[permission] = effect

    contexts = []
    for user_id in tenant_memberships.keys() | memberships.keys():
        tm = tenant_memberships.get(user_id)
        om = memberships.get(user_id)
        user = (tm or om).user  # type: ignore[union-attr]
        if not user.is_active:
            continue
        if (tm and not tm.is_active) or (om and not om.is_active):
            continue
        via_tenant = tm is not None and (
            tm.organization_access == OrganizationAccess.ALL
            or (
                tm.organization_access == OrganizationAccess.SELECTED
                and tm.pk in selected
            )
        )
        if om is None and not via_tenant:
            continue
        contexts.append(
            build_context(
                user=user,
                organization=organization,
                tenant_membership=tm,
                membership=om,
                via_tenant=via_tenant,
                overrides=overrides.get(user_id, {}),
            ),
        )
    return sorted(contexts, key=lambda c: c.user.email)
