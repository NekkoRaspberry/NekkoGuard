"""
Organization invitations: "Add member" by email address.

- The email belongs to an existing account → that user is added directly with the
  default (least-privileged) Viewer role. Nobody is created.
- Otherwise → an ``OrganizationInvitation`` is stored and an email is sent with a
  link to accept it. The person creates their own account with that address; once
  the address is verified (or they accept while signed in), they become a Viewer.

Security:

- Tokens are 256-bit ``secrets.token_urlsafe`` values. Only their SHA-256 hash is
  stored, so a database leak reveals no usable link. Resending rotates the token.
- The Organization is read from the invitation row, never from the request.
- Acceptance is single-use (row lock + status change in one transaction), checks
  the expiry server-side, and requires a *verified* email address of the signed-in
  user equal to the invited one.
- The inviter needs the right to manage this Organization's access and to assign
  the invitation's role (``services._ensure_role_assignable``): an invitation never
  grants more than its sender may hand out.
"""

from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import timedelta
from typing import TYPE_CHECKING

from allauth.account.models import EmailAddress
from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.db import IntegrityError
from django.db import transaction
from django.template.loader import render_to_string
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from rest_framework.exceptions import NotFound
from rest_framework.exceptions import PermissionDenied
from rest_framework.exceptions import ValidationError

from . import services
from .models import InvitationStatus
from .models import MembershipStatus
from .models import OrganizationInvitation
from .models import OrganizationMembership
from .roles import OrganizationRole

if TYPE_CHECKING:
    from collections.abc import Callable

    from nekkoguard.users.models import User

    from .services import OrganizationActor

logger = logging.getLogger(__name__)

DEFAULT_ROLE = OrganizationRole.VIEWER
TOKEN_BYTES = 32


def invitation_ttl() -> timedelta:
    return timedelta(days=settings.ORGANIZATION_INVITATION_TTL_DAYS)


def normalize_email(email: str) -> str:
    return email.strip().lower()


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _new_token() -> tuple[str, str]:
    token = secrets.token_urlsafe(TOKEN_BYTES)
    return token, hash_token(token)


def is_expired(invitation: OrganizationInvitation) -> bool:
    return invitation.expires_at <= timezone.now()


def effective_status(invitation: OrganizationInvitation) -> str:
    """A pending invitation past its expiry date is shown (and treated) as expired."""
    if invitation.status == InvitationStatus.PENDING and is_expired(invitation):
        return InvitationStatus.EXPIRED
    return invitation.status


def has_open_invitation(email: str) -> bool:
    """Is there a pending, unexpired invitation for this address (any Organization)?"""
    return OrganizationInvitation.objects.filter(
        email=normalize_email(email),
        status=InvitationStatus.PENDING,
        expires_at__gt=timezone.now(),
        organization__is_active=True,
        organization__tenant__is_active=True,
    ).exists()


# ---------------------------------------------------------------- email


def _display_name(user: User | None) -> str:
    if user is None:
        return "A NekkoGuard administrator"
    return user.name or user.email


def send_invitation_email(invitation: OrganizationInvitation, accept_url: str) -> None:
    """HTML + plain-text email. Contains no ids or tokens besides the link itself."""
    context = {
        "organization_name": invitation.organization.name,
        "inviter_name": _display_name(invitation.invited_by),
        "accept_url": accept_url,
        "email": invitation.email,
        "expires_at": invitation.expires_at,
        "role_label": OrganizationRole(invitation.role).label,
    }
    subject = render_to_string(
        "organizations/email/invitation_subject.txt",
        context,
    )
    message = EmailMultiAlternatives(
        subject=" ".join(subject.split()),  # one line, no header injection
        body=render_to_string("organizations/email/invitation_message.txt", context),
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[invitation.email],
    )
    message.attach_alternative(
        render_to_string("organizations/email/invitation_message.html", context),
        "text/html",
    )
    message.send()


def _send_after_commit(
    invitation: OrganizationInvitation,
    token: str,
    link_for: Callable[[str], str],
) -> None:
    url = link_for(token)

    def send() -> None:
        try:
            send_invitation_email(invitation, url)
        except Exception:
            # The invitation exists; the administrator can resend it.
            logger.exception("Could not send invitation %s", invitation.pk)

    transaction.on_commit(send)


# ---------------------------------------------------------------- add / invite


def _ensure_may_invite(actor: OrganizationActor, role: str) -> None:
    if not actor.assignable_roles():
        raise PermissionDenied(_("You cannot manage access to this organization."))
    services._ensure_role_assignable(actor, role)  # noqa: SLF001


@transaction.atomic
def add_or_invite(
    *,
    actor: OrganizationActor,
    email: str,
    link_for: Callable[[str], str],
) -> tuple[str, OrganizationMembership | OrganizationInvitation]:
    """
    Returns ("added", membership) for an existing account, ("invited", invitation)
    otherwise. Always the default Viewer role: administrators adjust it afterwards.
    """
    _ensure_may_invite(actor, DEFAULT_ROLE)
    email = normalize_email(email)
    from nekkoguard.users.models import User  # noqa: PLC0415

    user = User.objects.filter(email__iexact=email).first()
    if user is not None:
        if not user.is_active:
            raise ValidationError({"email": [_("This account cannot be added.")]})
        membership = services.add_organization_member(
            actor=actor,
            user=user,
            role=DEFAULT_ROLE,
        )
        return "added", membership
    return "invited", _create_invitation(actor=actor, email=email, link_for=link_for)


def _create_invitation(
    *,
    actor: OrganizationActor,
    email: str,
    link_for: Callable[[str], str],
) -> OrganizationInvitation:
    organization = actor.organization
    open_invitation = (
        OrganizationInvitation.objects.select_for_update()
        .filter(
            organization=organization,
            email=email,
            status=InvitationStatus.PENDING,
        )
        .first()
    )
    if open_invitation is not None:
        if not is_expired(open_invitation):
            raise ValidationError(
                {
                    "email": [
                        _(
                            "An invitation to this email is already pending. "
                            "Resend it from the list of invitations.",
                        ),
                    ],
                },
            )
        open_invitation.status = InvitationStatus.EXPIRED
        open_invitation.save(update_fields=["status", "updated_at"])

    token, token_hash = _new_token()
    now = timezone.now()
    try:
        with transaction.atomic():
            invitation = OrganizationInvitation.objects.create(
                organization=organization,
                email=email,
                role=DEFAULT_ROLE,
                invited_by=actor.user,
                token_hash=token_hash,
                expires_at=now + invitation_ttl(),
                last_sent_at=now,
            )
    except IntegrityError:  # a concurrent request invited the same address
        raise ValidationError(
            {"email": [_("An invitation to this email is already pending.")]},
        ) from None
    services.record_activity(
        tenant=organization.tenant,
        organization=organization,
        actor=actor.user,
        action="organization_invitation.created",
        target=invitation,
        target_name=email,
        details={"role": DEFAULT_ROLE},
    )
    _send_after_commit(invitation, token, link_for)
    return invitation


@transaction.atomic
def resend_invitation(
    *,
    actor: OrganizationActor,
    invitation: OrganizationInvitation,
    link_for: Callable[[str], str],
) -> OrganizationInvitation:
    """New token (the old link stops working) and a new expiry date."""
    invitation = OrganizationInvitation.objects.select_for_update().get(
        pk=invitation.pk,
    )
    _ensure_may_invite(actor, invitation.role)
    if invitation.status not in {InvitationStatus.PENDING, InvitationStatus.EXPIRED}:
        raise ValidationError(_("Only pending or expired invitations can be resent."))
    if invitation.status == InvitationStatus.EXPIRED and (
        OrganizationInvitation.objects.filter(
            organization=invitation.organization,
            email=invitation.email,
            status=InvitationStatus.PENDING,
        ).exists()
    ):
        raise ValidationError(_("A newer invitation to this email is already pending."))

    token, token_hash = _new_token()
    now = timezone.now()
    invitation.token_hash = token_hash
    invitation.status = InvitationStatus.PENDING
    invitation.expires_at = now + invitation_ttl()
    invitation.last_sent_at = now
    invitation.save(
        update_fields=[
            "token_hash",
            "status",
            "expires_at",
            "last_sent_at",
            "updated_at",
        ],
    )
    services.record_activity(
        tenant=invitation.organization.tenant,
        organization=invitation.organization,
        actor=actor.user,
        action="organization_invitation.resent",
        target=invitation,
        target_name=invitation.email,
    )
    _send_after_commit(invitation, token, link_for)
    return invitation


@transaction.atomic
def revoke_invitation(
    *,
    actor: OrganizationActor,
    invitation: OrganizationInvitation,
) -> OrganizationInvitation:
    invitation = OrganizationInvitation.objects.select_for_update().get(
        pk=invitation.pk,
    )
    _ensure_may_invite(actor, invitation.role)
    if invitation.status not in {InvitationStatus.PENDING, InvitationStatus.EXPIRED}:
        raise ValidationError(_("Only pending invitations can be revoked."))
    invitation.status = InvitationStatus.REVOKED
    invitation.revoked_at = timezone.now()
    invitation.save(update_fields=["status", "revoked_at", "updated_at"])
    services.record_activity(
        tenant=invitation.organization.tenant,
        organization=invitation.organization,
        actor=actor.user,
        action="organization_invitation.revoked",
        target=invitation,
        target_name=invitation.email,
    )
    return invitation


# ---------------------------------------------------------------- accept


def find_by_token(token: str) -> OrganizationInvitation | None:
    return (
        OrganizationInvitation.objects.select_related(
            "organization__tenant",
            "invited_by",
        )
        .filter(token_hash=hash_token(token))
        .first()
    )


def _has_verified_email(user: User, email: str) -> bool:
    return EmailAddress.objects.filter(
        user=user,
        email__iexact=email,
        verified=True,
    ).exists()


def _accept(invitation: OrganizationInvitation, user: User) -> bool:
    """Lock held by the caller. Returns True when the user already was a member."""
    organization = invitation.organization
    membership = OrganizationMembership.objects.filter(
        organization=organization,
        user=user,
    ).first()
    already_member = membership is not None
    if membership is None:
        membership = OrganizationMembership.objects.create(
            organization=organization,
            user=user,
            role=invitation.role,
            status=MembershipStatus.ACTIVE,
        )
    invitation.status = InvitationStatus.ACCEPTED
    invitation.accepted_at = timezone.now()
    invitation.accepted_by = user
    invitation.save(
        update_fields=["status", "accepted_at", "accepted_by", "updated_at"],
    )
    services.record_activity(
        tenant=organization.tenant,
        organization=organization,
        actor=user,
        action="organization_invitation.accepted",
        target=membership,
        target_name=user.email,
        details={"role": membership.role, "already_member": already_member},
    )
    return already_member


@transaction.atomic
def accept_invitation(*, token: str, user: User) -> tuple[OrganizationInvitation, bool]:
    found = find_by_token(token)
    if found is None:
        raise NotFound(_("This invitation does not exist."))
    invitation = (
        OrganizationInvitation.objects.select_for_update()
        .select_related("organization__tenant")
        .get(pk=found.pk)
    )
    status = effective_status(invitation)
    if status != InvitationStatus.PENDING:
        raise ValidationError(
            {"detail": [_("This invitation is no longer valid.")], "status": status},
        )
    organization = invitation.organization
    if not (organization.is_active and organization.tenant.is_active):
        raise ValidationError({"detail": [_("This organization is not available.")]})
    if not _has_verified_email(user, invitation.email):
        raise PermissionDenied(
            _(
                "This invitation was sent to another email address. Sign in with "
                "the account that uses it, or verify that address first.",
            ),
        )
    return invitation, _accept(invitation, user)


def accept_invitations_for_verified_email(user: User, email: str) -> int:
    """
    Called when ``email`` has just been verified for ``user``: proof of owning the
    address, exactly what the emailed link proves. Accepts every pending, unexpired
    invitation sent to it, so a new user needs no extra step after signing up.
    """
    accepted = 0
    pending = OrganizationInvitation.objects.filter(
        email=normalize_email(email),
        status=InvitationStatus.PENDING,
        expires_at__gt=timezone.now(),
        organization__is_active=True,
        organization__tenant__is_active=True,
    ).values_list("pk", flat=True)
    for pk in list(pending):
        try:
            with transaction.atomic():
                invitation = (
                    OrganizationInvitation.objects.select_for_update()
                    .select_related("organization__tenant")
                    .get(pk=pk)
                )
                if effective_status(invitation) == InvitationStatus.PENDING:
                    _accept(invitation, user)
                    accepted += 1
        except Exception:
            # Never break email verification because of an invitation.
            logger.exception("Could not accept invitation %s", pk)
    return accepted
