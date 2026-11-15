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


class InvitationStatus(models.TextChoices):
    PENDING = "pending", _("Pending")
    ACCEPTED = "accepted", _("Accepted")
    EXPIRED = "expired", _("Expired")
    REVOKED = "revoked", _("Revoked")


class OrganizationInvitation(TimeStampedModel):
    """
    An invitation to join one Organization, sent by email to someone who has no
    NekkoGuard account yet. Accepting it creates an ``OrganizationMembership`` with
    the invitation's role (always the least-privileged Viewer today).

    Only a SHA-256 hash of the token is stored: the token itself exists only in the
    email. Resending rotates the token. The Organization comes from this row, never
    from the request, so a token cannot be used to join another Organization.
    A PENDING invitation whose ``expires_at`` has passed counts as expired.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="invitations",
    )
    # Stored lower-cased (see services.normalize_email).
    email = models.EmailField(_("email"))
    role = models.CharField(
        _("organization role"),
        max_length=32,
        choices=OrganizationRole.choices,
        default=OrganizationRole.VIEWER,
    )
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    token_hash = models.CharField(_("token hash"), max_length=64, unique=True)
    status = models.CharField(
        _("status"),
        max_length=16,
        choices=InvitationStatus.choices,
        default=InvitationStatus.PENDING,
    )
    expires_at = models.DateTimeField(_("expires at"))
    last_sent_at = models.DateTimeField(_("last sent at"))
    accepted_at = models.DateTimeField(_("accepted at"), null=True, blank=True)
    accepted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    revoked_at = models.DateTimeField(_("revoked at"), null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            # One open invitation per address and Organization.
            models.UniqueConstraint(
                "organization",
                Lower("email"),
                condition=Q(status="pending"),
                name="organization_invitation_unique_pending_email",
                violation_error_message=_("This email is already invited."),
            ),
        ]
        indexes = [models.Index(fields=["email", "status"])]

    def __str__(self) -> str:
        return f"{self.email} → {self.organization} ({self.status})"


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


# ---------------------------------------------------------------- appearance


class NavbarPosition(models.TextChoices):
    LEFT = "left", _("Left")
    TOP = "top", _("Top")
    RIGHT = "right", _("Right")


#: Theme colors an Appearance Admin may set, in display order.
COLOR_FIELDS = (
    "primary_color",
    "primary_hover_color",
    "secondary_color",
    "accent_color",
    "background_color",
    "surface_color",
    "sidebar_color",
    "text_color",
    "text_muted_color",
    "border_color",
    "success_color",
    "warning_color",
    "danger_color",
)
#: Every plain (non-image) appearance setting.
APPEARANCE_FIELDS = ("title", *COLOR_FIELDS, "navbar_position")
#: Uploaded images: bytes in ``<asset>``, fingerprint in ``<asset>_hash``.
APPEARANCE_ASSETS = ("logo", "favicon")

TITLE_MAX_LENGTH = 60
HEX_COLOR_REGEX = r"^#[0-9a-f]{6}$"


# NULL is meaningful on these CharFields: it means "not configured here, inherit",
# which an empty string could not express (hence the DJ001 exceptions below).


def _color_field(label: str) -> models.CharField:
    return models.CharField(label, max_length=7, null=True, blank=True)


class Appearance(TimeStampedModel):
    """
    White-label settings shared by Tenants and Organizations.

    **Every field is optional and NULL means "inherit"** (Organization → Tenant →
    NekkoGuard default). Nothing here is CSS, HTML or script: only validated
    ``#rrggbb`` colors, a plain-text title, a position from a fixed list and images
    re-encoded server-side (see ``appearance.py``).

    Images are kept in the database, not in MEDIA_ROOT: they are small (re-encoded,
    size-capped PNGs), are never served by nginx without authentication, and are
    removed together with the row.
    """

    title = models.CharField(  # noqa: DJ001
        _("application title"),
        max_length=TITLE_MAX_LENGTH,
        null=True,
        blank=True,
    )
    logo = models.BinaryField(_("logo (PNG)"), null=True, blank=True)
    logo_hash = models.CharField(  # noqa: DJ001
        max_length=16,
        null=True,
        blank=True,
        editable=False,
    )
    favicon = models.BinaryField(_("favicon (PNG)"), null=True, blank=True)
    favicon_hash = models.CharField(  # noqa: DJ001
        max_length=16,
        null=True,
        blank=True,
        editable=False,
    )

    primary_color = _color_field(_("primary color"))
    primary_hover_color = _color_field(_("primary hover color"))
    secondary_color = _color_field(_("secondary color"))
    accent_color = _color_field(_("accent color"))
    background_color = _color_field(_("background color"))
    surface_color = _color_field(_("surface color"))
    sidebar_color = _color_field(_("sidebar/navbar color"))
    text_color = _color_field(_("text color"))
    text_muted_color = _color_field(_("muted text color"))
    border_color = _color_field(_("border color"))
    success_color = _color_field(_("success color"))
    warning_color = _color_field(_("warning color"))
    danger_color = _color_field(_("danger color"))

    navbar_position = models.CharField(  # noqa: DJ001
        _("navigation position"),
        max_length=8,
        choices=NavbarPosition.choices,
        null=True,
        blank=True,
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )

    class Meta:
        abstract = True
        constraints = [
            *(
                models.CheckConstraint(
                    condition=Q(**{f"{name}__isnull": True})
                    | Q(**{f"{name}__regex": HEX_COLOR_REGEX}),
                    name=f"%(class)s_{name}_hex",
                )
                for name in COLOR_FIELDS
            ),
            models.CheckConstraint(
                condition=Q(navbar_position__isnull=True)
                | Q(navbar_position__in=NavbarPosition.values),
                name="%(class)s_navbar_position_valid",
            ),
            models.CheckConstraint(
                condition=Q(title__isnull=True) | ~Q(title=""),
                name="%(class)s_title_not_blank",
            ),
            *(
                models.CheckConstraint(
                    condition=Q(
                        **{f"{asset}__isnull": True, f"{asset}_hash__isnull": True},
                    )
                    | Q(**{f"{asset}__isnull": False, f"{asset}_hash__isnull": False}),
                    name=f"%(class)s_{asset}_hash_consistent",
                )
                for asset in ("logo", "favicon")
            ),
        ]

    def has_asset(self, asset: str) -> bool:
        return getattr(self, f"{asset}_hash") is not None


class TenantAppearance(Appearance):
    """The Tenant's look & feel; the default for all of its Organizations."""

    tenant = models.OneToOneField(
        Tenant,
        on_delete=models.CASCADE,
        related_name="appearance",
    )

    class Meta(Appearance.Meta):
        verbose_name = _("tenant appearance")

    def __str__(self) -> str:
        return f"Appearance of {self.tenant}"


class OrganizationAppearance(Appearance):
    """
    Per-Organization overrides. An Organization belongs to exactly one Tenant, so
    an override can never point at another Tenant's settings.
    """

    organization = models.OneToOneField(
        Organization,
        on_delete=models.CASCADE,
        related_name="appearance",
    )

    class Meta(Appearance.Meta):
        verbose_name = _("organization appearance")

    def __str__(self) -> str:
        return f"Appearance of {self.organization}"
