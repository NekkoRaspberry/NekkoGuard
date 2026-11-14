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

Platform Administrator is not a role here: it is ``User.is_staff``.
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
    OWNER = "owner", _("Tenant Owner")
    ADMIN = "admin", _("Tenant Administrator")
    MEMBER = "member", _("Tenant Member")


class OrganizationRole(models.TextChoices):
    OWNER = "owner", _("Organization Owner")
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


class Permission(StrEnum):
    """Organization permissions. Add entries here when new modules (devices…) land."""

    MANAGE_ORGANIZATION = "organization.manage"
    MANAGE_MEMBERS = "members.manage"
    VIEW_SITES = "sites.view"
    MANAGE_SITES = "sites.manage"
    VIEW_NETWORKS = "networks.view"
    MANAGE_NETWORKS = "networks.manage"
    VIEW_ACTIVITY = "activity.view"


PERMISSION_CHOICES = [(p.value, p.value) for p in Permission]

_READ = frozenset({Permission.VIEW_SITES, Permission.VIEW_NETWORKS})

TENANT_ROLE_PERMISSIONS: dict[str, frozenset[TenantPermission]] = {
    TenantRole.OWNER: frozenset(TenantPermission),
    TenantRole.ADMIN: frozenset(TenantPermission),
    TenantRole.MEMBER: frozenset({TenantPermission.VIEW}),
}

ORGANIZATION_ROLE_PERMISSIONS: dict[str, frozenset[Permission]] = {
    OrganizationRole.OWNER: frozenset(Permission),
    OrganizationRole.ADMIN: frozenset(Permission),
    # Domain rights (finding triage, container actions…) are added with those modules.
    OrganizationRole.SECURITY_ANALYST: _READ | {Permission.VIEW_ACTIVITY},
    OrganizationRole.OPERATOR: _READ,
    OrganizationRole.VIEWER: _READ,
}

# Which roles a holder of a role may hand out, change or remove.
# Nobody grants a role above their own: only owners create owners.
TENANT_ASSIGNABLE: dict[str, frozenset[str]] = {
    TenantRole.OWNER: frozenset(TenantRole.values),
    TenantRole.ADMIN: frozenset(TenantRole.values) - {TenantRole.OWNER},
}
ORGANIZATION_ASSIGNABLE: dict[str, frozenset[str]] = {
    OrganizationRole.OWNER: frozenset(OrganizationRole.values),
    OrganizationRole.ADMIN: frozenset(OrganizationRole.values)
    - {OrganizationRole.OWNER},
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
