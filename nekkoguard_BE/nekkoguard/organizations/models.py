"""
Multi-tenant domain: Platform → Tenant → Organization → Site → Network (→ Devices).

- A **Tenant** is a management environment (an MSP, a household, a company) that
  owns several Organizations.
- An **Organization** is one infrastructure environment ("My Home", "Customer A").
  Everything below it belongs to exactly one Organization.
- A **User** reaches a Tenant through a ``TenantMembership`` and an Organization
  through a direct ``OrganizationMembership`` and/or the Tenant membership's
  organization access policy. ``PermissionOverride`` rows fine-tune permissions per
  Organization. How these combine is decided only in ``access.py``.
- Platform Administrators are users with ``is_staff``: they manage Tenants but see
  no infrastructure data unless they are members.
"""

from __future__ import annotations

import ipaddress
import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q
from django.db.models.functions import Lower
from django.utils.translation import gettext_lazy as _

from .roles import PERMISSION_CHOICES
from .roles import Effect
from .roles import OrganizationAccess
from .roles import OrganizationRole
from .roles import TenantRole

NAME_MAX_LENGTH = 120
DESCRIPTION_MAX_LENGTH = 500


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)
    updated_at = models.DateTimeField(_("updated at"), auto_now=True)

    class Meta:
        abstract = True


class MembershipStatus(models.TextChoices):
    ACTIVE = "active", _("Active")
    SUSPENDED = "suspended", _("Suspended")


# ---------------------------------------------------------------- tenant


class Tenant(TimeStampedModel):
    """Top-level boundary. Deactivated tenants are hidden from every member."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(_("name"), max_length=NAME_MAX_LENGTH)
    description = models.CharField(
        _("description"),
        max_length=DESCRIPTION_MAX_LENGTH,
        blank=True,
    )
    is_active = models.BooleanField(_("active"), default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                Lower("name"),
                name="tenant_unique_name_ci",
                violation_error_message=_("A tenant with this name already exists."),
            ),
        ]

    def __str__(self) -> str:
        return self.name


class Organization(TimeStampedModel):
    """One infrastructure environment inside a Tenant."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # PROTECT: a tenant with organizations is deactivated, never deleted by accident.
    tenant = models.ForeignKey(
        Tenant,
        on_delete=models.PROTECT,
        related_name="organizations",
    )
    name = models.CharField(_("name"), max_length=NAME_MAX_LENGTH)
    description = models.CharField(
        _("description"),
        max_length=DESCRIPTION_MAX_LENGTH,
        blank=True,
    )
    is_active = models.BooleanField(_("active"), default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                "tenant",
                Lower("name"),
                name="organization_unique_name_per_tenant_ci",
                violation_error_message=_(
                    "An organization with this name already exists in this tenant.",
                ),
            ),
        ]

    def __str__(self) -> str:
        return self.name


# ---------------------------------------------------------------- memberships


class TenantMembership(TimeStampedModel):
    """
    User ↔ Tenant. Two independent things live here:

    - ``role``: what the user may *administer* in the Tenant.
    - ``organization_access`` + ``default_organization_role``: which Organizations
      the user reaches through the Tenant, and with which inherited permissions.
    """

    tenant = models.ForeignKey(
        Tenant,
        on_delete=models.CASCADE,
        related_name="memberships",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="tenant_memberships",
    )
    role = models.CharField(_("tenant role"), max_length=32, choices=TenantRole.choices)
    status = models.CharField(
        _("status"),
        max_length=16,
        choices=MembershipStatus.choices,
        default=MembershipStatus.ACTIVE,
    )
    organization_access = models.CharField(
        _("organization access"),
        max_length=16,
        choices=OrganizationAccess.choices,
        default=OrganizationAccess.NONE,
    )
    default_organization_role = models.CharField(
        _("default organization role"),
        max_length=32,
        choices=OrganizationRole.choices,
        blank=True,
        help_text=_("Permissions inherited in the Organizations this user reaches."),
    )
    selected_organizations = models.ManyToManyField(
        Organization,
        through="TenantOrganizationAccess",
        related_name="+",
        blank=True,
    )

    class Meta:
        ordering = ["tenant", "user__email"]
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "user"],
                name="tenant_membership_unique_user",
                violation_error_message=_("This user is already a member."),
            ),
            # Access without a default role would be access with no permissions:
            # always say which role is inherited.
            models.CheckConstraint(
                condition=Q(organization_access=OrganizationAccess.NONE)
                | ~Q(default_organization_role=""),
                name="tenant_membership_access_needs_default_role",
                violation_error_message=_(
                    "Choose the default organization role for this access.",
                ),
            ),
        ]
        indexes = [models.Index(fields=["user", "status"])]

    def __str__(self) -> str:
        return f"{self.user} @ {self.tenant} ({self.role})"

    @property
    def is_active(self) -> bool:
        return self.status == MembershipStatus.ACTIVE


class TenantOrganizationAccess(models.Model):
    """One Organization picked for a ``SELECTED`` Tenant membership."""

    membership = models.ForeignKey(
        TenantMembership,
        on_delete=models.CASCADE,
        related_name="organization_grants",
    )
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="tenant_access_grants",
    )
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["membership", "organization"],
                name="tenant_organization_access_unique",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.membership} → {self.organization}"

    def clean(self) -> None:
        # Never reach an Organization of another Tenant (also checked in services).
        if self.organization.tenant_id != self.membership.tenant_id:
            raise ValidationError(
                {"organization": _("This organization belongs to another tenant.")},
            )


class OrganizationMembership(TimeStampedModel):
    """Direct User ↔ Organization access. Grants no Tenant administration."""

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="memberships",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="organization_memberships",
    )
    role = models.CharField(
        _("organization role"),
        max_length=32,
        choices=OrganizationRole.choices,
    )
    status = models.CharField(
        _("status"),
        max_length=16,
        choices=MembershipStatus.choices,
        default=MembershipStatus.ACTIVE,
    )

    class Meta:
        ordering = ["organization", "user__email"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "user"],
                name="organization_membership_unique_user",
                violation_error_message=_("This user is already a member."),
            ),
        ]
        indexes = [models.Index(fields=["user", "status"])]

    def __str__(self) -> str:
        return f"{self.user} @ {self.organization} ({self.role})"

    @property
    def is_active(self) -> bool:
        return self.status == MembershipStatus.ACTIVE


class PermissionOverride(TimeStampedModel):
    """
    Explicit GRANT/DENY of one permission for one user in one Organization.

    No row means INHERIT. An override never creates access to the Organization: it
    only changes permissions for a user who already reaches it.
    """

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="permission_overrides",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="permission_overrides",
    )
    permission = models.CharField(
        _("permission"),
        max_length=64,
        choices=PERMISSION_CHOICES,
    )
    effect = models.CharField(_("effect"), max_length=8, choices=Effect.choices)

    class Meta:
        ordering = ["organization", "user__email", "permission"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "user", "permission"],
                name="permission_override_unique",
                violation_error_message=_("This permission already has an override."),
            ),
        ]

    def __str__(self) -> str:
        return f"{self.effect} {self.permission} → {self.user} @ {self.organization}"


# ---------------------------------------------------------------- infrastructure


class Site(TimeStampedModel):
    """A physical or logical location (home, office, data center…)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="sites",
    )
    name = models.CharField(_("name"), max_length=NAME_MAX_LENGTH)
    description = models.CharField(
        _("description"),
        max_length=DESCRIPTION_MAX_LENGTH,
        blank=True,
    )

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                "organization",
                Lower("name"),
                name="site_unique_name_per_organization_ci",
                violation_error_message=_("A site with this name already exists."),
            ),
        ]

    def __str__(self) -> str:
        return self.name


def validate_cidr(value: str) -> None:
    try:
        ipaddress.ip_network(value, strict=True)
    except ValueError as error:
        raise ValidationError(
            _("Enter a network in CIDR notation, for example 192.0.2.0/24."),
            code="invalid_cidr",
        ) from error


class Network(TimeStampedModel):
    """A network or subnet at a site. Devices and discovery settings hang off it."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    site = models.ForeignKey(Site, on_delete=models.CASCADE, related_name="networks")
    name = models.CharField(_("name"), max_length=NAME_MAX_LENGTH)
    cidr = models.CharField(
        _("CIDR"),
        max_length=43,
        blank=True,
        validators=[validate_cidr],
        help_text=_("Address range, e.g. 192.0.2.0/24. Optional."),
    )
    description = models.CharField(
        _("description"),
        max_length=DESCRIPTION_MAX_LENGTH,
        blank=True,
    )

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                "site",
                Lower("name"),
                name="network_unique_name_per_site_ci",
                violation_error_message=_("A network with this name already exists."),
            ),
        ]

    def __str__(self) -> str:
        return self.name


# ---------------------------------------------------------------- audit


class ActivityEntry(models.Model):
    """Audit trail. ``organization`` is empty for Tenant-level actions."""

    tenant = models.ForeignKey(
        Tenant,
        on_delete=models.CASCADE,
        related_name="activity",
    )
    organization = models.ForeignKey(
        Organization,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="activity",
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    # Kept even if the actor's account is deleted later.
    actor_email = models.EmailField(_("actor email"), blank=True)
    action = models.CharField(_("action"), max_length=64)
    target_type = models.CharField(_("target type"), max_length=32)
    target_id = models.CharField(_("target id"), max_length=64, blank=True)
    target_name = models.CharField(_("target name"), max_length=255, blank=True)
    details = models.JSONField(_("details"), default=dict, blank=True)
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["tenant", "-created_at"]),
            models.Index(fields=["organization", "-created_at"]),
        ]
        verbose_name_plural = _("activity entries")

    def __str__(self) -> str:
        return f"{self.actor_email} {self.action} {self.target_type} {self.target_name}"
