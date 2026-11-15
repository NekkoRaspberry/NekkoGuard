"""Signal receivers of the organizations app."""

from __future__ import annotations

from typing import Any

from allauth.account.signals import email_confirmed
from django.dispatch import receiver

from .invitations import accept_invitations_for_verified_email


@receiver(email_confirmed)
def accept_invitations_on_email_confirmed(
    sender: Any,
    request: Any,
    email_address: Any,
    **kwargs: Any,
) -> None:
    """A newly verified address joins the Organizations it was invited to."""
    accept_invitations_for_verified_email(email_address.user, email_address.email)
