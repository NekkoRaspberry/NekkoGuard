"""
Setting up an authenticator app proves possession of it (a valid code was entered),
so this session counts as having passed MFA — Tenant administration becomes
available right away, without signing out and in again. See
``organizations.access.request_passed_mfa``.
"""

from __future__ import annotations

from allauth.account.internal.flows.login import record_authentication
from allauth.mfa.models import Authenticator
from allauth.mfa.signals import authenticator_added
from django.dispatch import receiver


@receiver(authenticator_added)
def record_mfa_on_setup(sender, request, user, authenticator, **kwargs) -> None:
    if authenticator.type == Authenticator.Type.RECOVERY_CODES:
        return  # generated alongside the app; proves nothing on its own
    if request is None or getattr(request, "user", None) != user:
        return
    record_authentication(
        request,
        user,
        method="mfa",
        type=authenticator.type,
        id=authenticator.pk,
    )
