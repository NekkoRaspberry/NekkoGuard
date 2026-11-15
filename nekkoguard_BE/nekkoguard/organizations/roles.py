"""
Roles and permissions: the catalog the access resolver (``access.py``) works with.

Two separate permission families:

- ``TenantPermission``: administering a Tenant (its details, members, organizations).
  Comes **only** from the Tenant membership role. Never from Organization data.
- ``Permission``: operating on one Organization's resources (sites, networks, …).
  Comes from an Organization role (direct membership) or from the Tenant
  membership's *default organization role*, and can be overridden per Organization.

Views ask for a permission, never for a role. Custom roles later only need a new
source of role → permission sets; the resolver keeps the same interface.

Platform Administrator is not a role here: it is ``User.is_staff``. There is no
Owner role: Administrator is the highest role in a Tenant and in an Organization;
anything above it (e.g. fixing a Tenant's last administrator) is for superusers.
"""

from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING

from django.db import models
from django.utils.translation import gettext_lazy as _

if TYPE_CHECKING:
    from collections.abc import Iterable

    from django.contrib.auth.models import AbstractBaseUser
    from django.contrib.auth.models import AnonymousUser


class TenantRole(models.TextChoices):
    ADMIN = "admin", _("Tenant Administrator")
    MEMBER = "member", _("Tenant Member")


class OrganizationRole(models.TextChoices):
    ADMIN = "admin", _("Organization Administrator")
    SECURITY_ANALYST = "security_analyst", _("Security Analyst")
    OPERATOR = "operator", _("Operator")
    VIEWER = "viewer", _("Viewer")


class OrganizationAccess(models.TextChoices):
    """Which Organizations a Tenant membership reaches."""

    ALL = "all", _("All organizations")
    SELECTED = "selected", _("Selected organizations")
    NONE = "none", _("No organizations")


class Effect(models.TextChoices):
    """An explicit Organization-level decision. No override row means INHERIT."""

    GRANT = "grant", _("Grant")
    DENY = "deny", _("Deny")


class TenantPermission(StrEnum):
    VIEW = "tenant.view"
    MANAGE = "tenant.manage"
    MANAGE_MEMBERS = "tenant.members.manage"
    MANAGE_ORGANIZATIONS = "tenant.organizations.manage"
    VIEW_ACTIVITY = "tenant.activity.view"
    #: Appearance Admin: branding/look & feel of the Tenant and of every Organization
    #: in it. Visual customization only — it never grants infrastructure access.
    MANAGE_APPEARANCE = "tenant.appearance.manage"


class Permission(StrEnum):
    """Organization permissions. Add entries here when new modules (devices…) land."""

    MANAGE_ORGANIZATION = "organization.manage"
    MANAGE_MEMBERS = "members.manage"
    VIEW_SITES = "sites.view"
    MANAGE_SITES = "sites.manage"
    VIEW_NETWORKS = "networks.view"
    MANAGE_NETWORKS = "networks.manage"
    #: Read-only: the Organization's members, invitations and permissions
    #: (effective access, overrides). Changing them needs MANAGE_MEMBERS.
    VIEW_MEMBERS = "members.view"
    VIEW_ACTIVITY = "activity.view"
    #: Appearance Admin of one Organization (branding only, no infrastructure).
    MANAGE_APPEARANCE = "organization.appearance.manage"


PERMISSION_CHOICES = [(p.value, p.value) for p in Permission]

# Every role may look (read-only) at sites, networks, members, permissions and activity.
READ_PERMISSIONS = _READ = frozenset(
    {
        Permission.VIEW_SITES,
        Permission.VIEW_NETWORKS,
        Permission.VIEW_MEMBERS,
        Permission.VIEW_ACTIVITY,
    },
)

TENANT_ROLE_PERMISSIONS: dict[str, frozenset[TenantPermission]] = {
    TenantRole.ADMIN: frozenset(TenantPermission),
    TenantRole.MEMBER: frozenset({TenantPermission.VIEW}),
}

ORGANIZATION_ROLE_PERMISSIONS: dict[str, frozenset[Permission]] = {
    OrganizationRole.ADMIN: frozenset(Permission),
    # Domain rights (finding triage, container actions…) are added with those modules.
    OrganizationRole.SECURITY_ANALYST: _READ,
    OrganizationRole.OPERATOR: _READ,
    OrganizationRole.VIEWER: _READ,
}

# Which roles a holder of a role may hand out, change or remove.
# Nobody grants a role above their own (Administrator is the highest).
TENANT_ASSIGNABLE: dict[str, frozenset[str]] = {
    TenantRole.ADMIN: frozenset(TenantRole.values),
}
ORGANIZATION_ASSIGNABLE: dict[str, frozenset[str]] = {
    OrganizationRole.ADMIN: frozenset(OrganizationRole.values),
}


def tenant_permissions_for(role: str) -> frozenset[TenantPermission]:
    return TENANT_ROLE_PERMISSIONS.get(role, frozenset())


def organization_permissions_for(role: str | None) -> frozenset[Permission]:
    return ORGANIZATION_ROLE_PERMISSIONS.get(role or "", frozenset())


def assignable_organization_roles(roles: Iterable[str]) -> frozenset[str]:
    result: frozenset[str] = frozenset()
    for role in roles:
        result |= ORGANIZATION_ASSIGNABLE.get(role, frozenset())
    return result


def is_platform_admin(user: AbstractBaseUser | AnonymousUser) -> bool:
    return bool(
        user.is_authenticated and user.is_active and getattr(user, "is_staff", False),
    )
