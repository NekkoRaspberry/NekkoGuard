"""
Write operations, with the rules that must hold no matter which view calls them.

Anti-escalation rules:

- Nobody changes their own memberships or overrides. One exception: a Tenant
  **owner** may change their own *organization access* settings (never their own
  role or status), so a single-person Tenant can still reach its Organizations.
  Every such change is audit-logged.
- Roles are only handed out up to the actor's own level (``roles.*_ASSIGNABLE``),
  and members holding a higher role cannot be changed.
- Organization-level managers (``members.manage`` in that Organization) cannot
  touch users who administer the Tenant, and can only GRANT permissions they hold.
- Every Tenant keeps at least one active owner.
- A Tenant membership can only select Organizations of the same Tenant.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING
from typing import Any

from django.db import transaction
from django.utils.translation import gettext_lazy as _
from rest_framework.exceptions import PermissionDenied
from rest_framework.exceptions import ValidationError

from .access import OrganizationContext
from .access import TenantAccess
from .access import reaches_through_tenant
from .models import ActivityEntry
from .models import MembershipStatus
from .models import Organization
from .models import OrganizationMembership
from .models import PermissionOverride
from .models import Tenant
from .models import TenantMembership
from .models import TenantOrganizationAccess
from .roles import TENANT_ASSIGNABLE
from .roles import Effect
from .roles import OrganizationAccess
from .roles import OrganizationRole
from .roles import Permission
from .roles import TenantPermission
from .roles import TenantRole
from .roles import assignable_organization_roles

if TYPE_CHECKING:
    from collections.abc import Iterable

    from django.db import models

    from nekkoguard.users.models import User


# ---------------------------------------------------------------- audit


def record_activity(  # noqa: PLR0913
    *,
    tenant: Tenant,
    actor: User | None,
    action: str,
    target: models.Model,
    organization: Organization | None = None,
    target_name: str | None = None,
    details: dict[str, Any] | None = None,
) -> ActivityEntry:
    """Never put passwords, tokens or other secrets in ``details``."""
    return ActivityEntry.objects.create(
        tenant=tenant,
        organization=organization,
        actor=actor,
        actor_email=getattr(actor, "email", "") or "",
        action=action,
        target_type=target._meta.model_name or "",  # noqa: SLF001
        target_id=str(target.pk),
        target_name=(target_name if target_name is not None else str(target))[:255],
        details=details or {},
    )


def _changes(instance: models.Model, values: dict[str, Any]) -> dict[str, list[Any]]:
    return {
        field: [getattr(instance, field), value]
        for field, value in values.items()
        if getattr(instance, field) != value
    }


# ---------------------------------------------------------------- tenants


@transaction.atomic
def create_tenant(
    *,
    name: str,
    description: str,
    owner: User,
    created_by: User,
) -> Tenant:
    """
    A new Tenant starts with one active owner. The owner administers the Tenant but
    reaches no Organization until access is configured (secure default).
    """
    tenant = Tenant.objects.create(
        name=name,
        description=description,
        created_by=created_by,
    )
    TenantMembership.objects.create(tenant=tenant, user=owner, role=TenantRole.OWNER)
    record_activity(
        tenant=tenant,
        actor=created_by,
        action="tenant.created",
        target=tenant,
        details={"owner": owner.email},
    )
    return tenant


def update_tenant(*, actor: User, tenant: Tenant, **values: Any) -> Tenant:
    changes = _changes(tenant, values)
    if not changes:
        return tenant
    for field, (_old, new) in changes.items():
        setattr(tenant, field, new)
    tenant.save(update_fields=[*changes, "updated_at"])
    action = "tenant.updated"
    if "is_active" in changes:
        action = "tenant.activated" if tenant.is_active else "tenant.deactivated"
    record_activity(
        tenant=tenant,
        actor=actor,
        action=action,
        target=tenant,
        details=changes,
    )
    return tenant


# ---------------------------------------------------------------- organizations


def create_organization(
    *,
    actor: TenantAccess,
    name: str,
    description: str,
) -> Organization:
    """Creating an Organization grants nobody access to it implicitly."""
    if not actor.can(TenantPermission.MANAGE_ORGANIZATIONS):
        raise PermissionDenied(_("You cannot create organizations in this tenant."))
    organization = Organization.objects.create(
        tenant=actor.tenant,
        name=name,
        description=description,
        created_by=actor.membership.user,
    )
    record_activity(
        tenant=actor.tenant,
        organization=organization,
        actor=actor.membership.user,
        action="organization.created",
        target=organization,
    )
    return organization


def update_organization(
    *,
    actor: User,
    organization: Organization,
    **values: Any,
) -> Organization:
    changes = _changes(organization, values)
    if not changes:
        return organization
    for field, (_old, new) in changes.items():
        setattr(organization, field, new)
    organization.save(update_fields=[*changes, "updated_at"])
    action = "organization.updated"
    if "is_active" in changes:
        action = (
            "organization.activated"
            if organization.is_active
            else "organization.deactivated"
        )
    record_activity(
        tenant=organization.tenant,
        organization=organization,
        actor=actor,
        action=action,
        target=organization,
        details=changes,
    )
    return organization


# ---------------------------------------------------------------- tenant members


def _ensure_tenant_manager(actor: TenantAccess) -> None:
    if not actor.can(TenantPermission.MANAGE_MEMBERS):
        raise PermissionDenied(_("You cannot manage members of this tenant."))


def _ensure_tenant_role_assignable(actor: TenantAccess, role: str) -> None:
    if role not in TENANT_ASSIGNABLE.get(actor.membership.role, frozenset()):
        raise PermissionDenied(_("You cannot assign or change this tenant role."))


def _other_active_owners(target: TenantMembership) -> bool:
    # Lock every owner row: two concurrent demotions must not both see "another
    # owner remains" and leave the tenant without one.
    owners = TenantMembership.objects.select_for_update().filter(
        tenant_id=target.tenant_id,
        role=TenantRole.OWNER,
        status=MembershipStatus.ACTIVE,
    )
    return any(owner.pk != target.pk for owner in owners)


def _ensure_owner_remains(target: TenantMembership, *, stays_owner: bool) -> None:
    is_active_owner = target.role == TenantRole.OWNER and target.is_active
    if is_active_owner and not stays_owner and not _other_active_owners(target):
        raise ValidationError(
            {"role": [_("A tenant needs at least one active owner.")]},
        )


def _clean_access(
    tenant: Tenant,
    organization_access: str,
    default_organization_role: str,
    selected: Iterable[Organization],
) -> list[Organization]:
    selected = list(selected)
    if organization_access != OrganizationAccess.NONE and not default_organization_role:
        raise ValidationError(
            {
                "default_organization_role": [
                    _("Choose the default organization role for this access."),
                ],
            },
        )
    if any(org.tenant_id != tenant.pk for org in selected):
        raise ValidationError(
            {
                "selected_organizations": [
                    _("Organizations must belong to this tenant."),
                ],
            },
        )
    if organization_access != OrganizationAccess.SELECTED:
        return []
    return selected


def _set_selected(membership: TenantMembership, selected: list[Organization]) -> None:
    membership.organization_grants.exclude(organization__in=selected).delete()
    existing = set(
        membership.organization_grants.values_list("organization_id", flat=True),
    )
    TenantOrganizationAccess.objects.bulk_create(
        TenantOrganizationAccess(membership=membership, organization=org)
        for org in selected
        if org.pk not in existing
    )


def _selected_ids(membership: TenantMembership) -> list[str]:
    return sorted(
        str(pk)
        for pk in membership.organization_grants.values_list(
            "organization_id",
            flat=True,
        )
    )


@transaction.atomic
def add_tenant_member(  # noqa: PLR0913
    *,
    actor: TenantAccess,
    user: User,
    role: str,
    organization_access: str = OrganizationAccess.NONE,
    default_organization_role: str = "",
    selected_organizations: Iterable[Organization] = (),
) -> TenantMembership:
    _ensure_tenant_manager(actor)
    _ensure_tenant_role_assignable(actor, role)
    tenant = actor.tenant
    if TenantMembership.objects.filter(tenant=tenant, user=user).exists():
        raise ValidationError({"email": [_("This user is already a member.")]})
    selected = _clean_access(
        tenant,
        organization_access,
        default_organization_role,
        selected_organizations,
    )
    membership = TenantMembership.objects.create(
        tenant=tenant,
        user=user,
        role=role,
        organization_access=organization_access,
        default_organization_role=default_organization_role,
    )
    _set_selected(membership, selected)
    record_activity(
        tenant=tenant,
        actor=actor.membership.user,
        action="tenant_member.added",
        target=membership,
        target_name=user.email,
        details={
            "role": role,
            "organization_access": organization_access,
            "default_organization_role": default_organization_role,
            "selected_organizations": _selected_ids(membership),
        },
    )
    return membership


_ACCESS_FIELDS = frozenset(
    {"organization_access", "default_organization_role", "selected_organizations"},
)


@transaction.atomic
def update_tenant_member(
    *,
    actor: TenantAccess,
    target: TenantMembership,
    **values: Any,
) -> TenantMembership:
    target = TenantMembership.objects.select_for_update().get(pk=target.pk)
    _ensure_tenant_manager(actor)
    if target.pk == actor.membership.pk:
        # Owners may adjust their own Organization access, nothing else.
        if actor.membership.role != TenantRole.OWNER or set(values) - _ACCESS_FIELDS:
            raise PermissionDenied(_("You cannot change your own membership."))
    _ensure_tenant_role_assignable(actor, target.role)
    new_role = values.get("role", target.role)
    new_status = values.get("status", target.status)
    _ensure_tenant_role_assignable(actor, new_role)
    _ensure_owner_remains(
        target,
        stays_owner=new_role == TenantRole.OWNER
        and new_status == MembershipStatus.ACTIVE,
    )
    new_access = values.get("organization_access", target.organization_access)
    new_default = values.get(
        "default_organization_role",
        target.default_organization_role,
    )
    if (
        new_access == OrganizationAccess.NONE
        and "default_organization_role" not in values
    ):
        new_default = ""
    if "selected_organizations" in values:
        selected_input = values["selected_organizations"]
    else:
        selected_input = [g.organization for g in target.organization_grants.all()]
    selected = _clean_access(target.tenant, new_access, new_default, selected_input)

    before_selected = _selected_ids(target)
    changes = _changes(
        target,
        {
            "role": new_role,
            "status": new_status,
            "organization_access": new_access,
            "default_organization_role": new_default,
        },
    )
    for field, (_old, new) in changes.items():
        setattr(target, field, new)
    if changes:
        target.save(update_fields=[*changes, "updated_at"])
    _set_selected(target, selected)
    after_selected = _selected_ids(target)
    if after_selected != before_selected:
        changes["selected_organizations"] = [before_selected, after_selected]
    if changes:
        record_activity(
            tenant=target.tenant,
            actor=actor.membership.user,
            action="tenant_member.updated",
            target=target,
            target_name=target.user.email,
            details=changes,
        )
    return target


@transaction.atomic
def remove_tenant_member(*, actor: TenantAccess, target: TenantMembership) -> None:
    target = TenantMembership.objects.select_for_update().get(pk=target.pk)
    _ensure_tenant_manager(actor)
    if target.pk == actor.membership.pk:
        raise PermissionDenied(_("You cannot change your own membership."))
    _ensure_tenant_role_assignable(actor, target.role)
    _ensure_owner_remains(target, stays_owner=False)
    record_activity(
        tenant=target.tenant,
        actor=actor.membership.user,
        action="tenant_member.removed",
        target=target,
        target_name=target.user.email,
        details={"role": target.role},
    )
    target.delete()


# ---------------------------------------------------------------- organization members


@dataclass(frozen=True)
class OrganizationActor:
    """Who is acting on an Organization: their Tenant and Organization standing."""

    user: User
    organization: Organization
    tenant_access: TenantAccess | None
    context: OrganizationContext | None

    @property
    def is_tenant_manager(self) -> bool:
        return self.tenant_access is not None and self.tenant_access.can(
            TenantPermission.MANAGE_MEMBERS,
        )

    @property
    def tenant_role(self) -> str | None:
        return self.tenant_access.membership.role if self.tenant_access else None

    def assignable_roles(self) -> frozenset[str]:
        if self.is_tenant_manager:
            return frozenset(OrganizationRole.values)
        if self.context is not None and self.context.can(Permission.MANAGE_MEMBERS):
            return assignable_organization_roles(self.context.roles)
        return frozenset()


def _target_standing(
    organization: Organization,
    user: User,
) -> tuple[TenantMembership | None, OrganizationMembership | None]:
    tm = TenantMembership.objects.filter(
        tenant_id=organization.tenant_id,
        user=user,
    ).first()
    om = OrganizationMembership.objects.filter(
        organization=organization,
        user=user,
    ).first()
    return tm, om


def _ensure_may_manage_user(actor: OrganizationActor, user: User) -> None:
    """May ``actor`` change ``user``'s membership/overrides in this Organization?"""
    if not actor.assignable_roles():
        raise PermissionDenied(_("You cannot manage access to this organization."))
    if user.pk == actor.user.pk:
        raise PermissionDenied(_("You cannot change your own access."))
    tm, om = _target_standing(actor.organization, user)
    if actor.is_tenant_manager:
        # Only a Tenant owner may change what another Tenant owner can do.
        if tm and tm.role == TenantRole.OWNER and actor.tenant_role != TenantRole.OWNER:
            raise PermissionDenied(_("You cannot change a tenant owner's access."))
        return
    # Organization-level managers never touch Tenant administrators.
    if tm and tm.role in {TenantRole.OWNER, TenantRole.ADMIN}:
        raise PermissionDenied(_("You cannot change a tenant administrator's access."))
    target_roles = set()
    if om is not None:
        target_roles.add(om.role)
    if (
        tm is not None
        and tm.default_organization_role
        and reaches_through_tenant(
            tm,
            actor.organization,
        )
    ):
        target_roles.add(tm.default_organization_role)
    if not target_roles <= actor.assignable_roles():
        raise PermissionDenied(_("You cannot change a member with this role."))


def _ensure_role_assignable(actor: OrganizationActor, role: str) -> None:
    if role not in actor.assignable_roles():
        raise PermissionDenied(_("You cannot assign this role."))


@transaction.atomic
def add_organization_member(
    *,
    actor: OrganizationActor,
    user: User,
    role: str,
) -> OrganizationMembership:
    _ensure_may_manage_user(actor, user)
    _ensure_role_assignable(actor, role)
    organization = actor.organization
    if OrganizationMembership.objects.filter(
        organization=organization,
        user=user,
    ).exists():
        raise ValidationError({"email": [_("This user is already a member.")]})
    membership = OrganizationMembership.objects.create(
        organization=organization,
        user=user,
        role=role,
    )
    record_activity(
        tenant=organization.tenant,
        organization=organization,
        actor=actor.user,
        action="organization_member.added",
        target=membership,
        target_name=user.email,
        details={"role": role},
    )
    return membership


@transaction.atomic
def update_organization_member(
    *,
    actor: OrganizationActor,
    target: OrganizationMembership,
    **values: Any,
) -> OrganizationMembership:
    target = OrganizationMembership.objects.select_for_update().get(pk=target.pk)
    _ensure_may_manage_user(actor, target.user)
    if "role" in values:
        _ensure_role_assignable(actor, values["role"])
    changes = _changes(target, values)
    if not changes:
        return target
    for field, (_old, new) in changes.items():
        setattr(target, field, new)
    target.save(update_fields=[*changes, "updated_at"])
    record_activity(
        tenant=target.organization.tenant,
        organization=target.organization,
        actor=actor.user,
        action="organization_member.updated",
        target=target,
        target_name=target.user.email,
        details=changes,
    )
    return target


@transaction.atomic
def remove_organization_member(
    *,
    actor: OrganizationActor,
    target: OrganizationMembership,
) -> None:
    _ensure_may_manage_user(actor, target.user)
    record_activity(
        tenant=target.organization.tenant,
        organization=target.organization,
        actor=actor.user,
        action="organization_member.removed",
        target=target,
        target_name=target.user.email,
        details={"role": target.role},
    )
    target.delete()


# ---------------------------------------------------------------- overrides


def _ensure_override_target(organization: Organization, user: User) -> None:
    tm, om = _target_standing(organization, user)
    if tm is None and om is None:
        raise ValidationError(
            {"user": [_("This user is not a member of this tenant or organization.")]},
        )


@transaction.atomic
def set_permission_override(
    *,
    actor: OrganizationActor,
    user: User,
    permission: str,
    effect: str,
) -> PermissionOverride:
    """Create or change an explicit GRANT/DENY (deleting it means INHERIT)."""
    _ensure_may_manage_user(actor, user)
    _ensure_override_target(actor.organization, user)
    if (
        effect == Effect.GRANT
        and not actor.is_tenant_manager
        and not (actor.context and actor.context.can(Permission(permission)))
    ):
        raise PermissionDenied(_("You can only grant permissions you have yourself."))
    override, created = PermissionOverride.objects.select_for_update().get_or_create(
        organization=actor.organization,
        user=user,
        permission=permission,
        defaults={"effect": effect},
    )
    if not created and override.effect == effect:
        return override
    previous = None if created else override.effect
    if not created:
        override.effect = effect
        override.save(update_fields=["effect", "updated_at"])
    record_activity(
        tenant=actor.organization.tenant,
        organization=actor.organization,
        actor=actor.user,
        action="permission_override.set",
        target=override,
        target_name=f"{user.email}: {permission}",
        details={"permission": permission, "effect": [previous, effect]},
    )
    return override


@transaction.atomic
def remove_permission_override(
    *,
    actor: OrganizationActor,
    override: PermissionOverride,
) -> None:
    _ensure_may_manage_user(actor, override.user)
    record_activity(
        tenant=actor.organization.tenant,
        organization=actor.organization,
        actor=actor.user,
        action="permission_override.removed",
        target=override,
        target_name=f"{override.user.email}: {override.permission}",
        details={"permission": override.permission, "effect": override.effect},
    )
    override.delete()
