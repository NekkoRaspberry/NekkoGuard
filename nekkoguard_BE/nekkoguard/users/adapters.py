from __future__ import annotations

import typing

from allauth.account.adapter import DefaultAccountAdapter
from allauth.socialaccount.adapter import DefaultSocialAccountAdapter
from django.conf import settings
from django.core.exceptions import ValidationError
from django.utils.translation import gettext_lazy as _

from nekkoguard.organizations.invitations import has_open_invitation

if typing.TYPE_CHECKING:
    from allauth.socialaccount.models import SocialLogin
    from django.http import HttpRequest

    from nekkoguard.users.models import User


def is_allowed_email_domain(email: str | None) -> bool:
    """True when the email belongs to a well-known provider (or no list is set)."""
    allowed = {d.strip().lower() for d in settings.ACCOUNT_ALLOWED_EMAIL_DOMAINS if d}
    if not allowed:
        return True
    domain = (email or "").rpartition("@")[2].strip().lower()
    return domain in allowed


class AccountAdapter(DefaultAccountAdapter):
    def is_open_for_signup(self, request: HttpRequest) -> bool:
        return getattr(settings, "ACCOUNT_ALLOW_REGISTRATION", True)

    def clean_email(self, email: str) -> str:
        """Used by email signup and when adding an email to an account."""
        email = super().clean_email(email)
        # An organization invitation sent to this exact address is enough: the
        # invitee may use their company address even when it is not a well-known
        # provider. (Signing up still requires verifying the address.)
        if not is_allowed_email_domain(email) and not has_open_invitation(email):
            raise ValidationError(
                _(
                    "Please use an address from a well-known email provider, "
                    "such as Gmail or Outlook.",
                ),
                code="email_domain_not_allowed",
            )
        return email


class SocialAccountAdapter(DefaultSocialAccountAdapter):
    def is_open_for_signup(
        self,
        request: HttpRequest,
        sociallogin: SocialLogin,
    ) -> bool:
        # Provider sign-ups skip clean_email, so check the domain here. This only runs
        # for new accounts: existing users keep signing in with their provider.
        if not is_allowed_email_domain(sociallogin.user.email):
            return False
        return getattr(settings, "ACCOUNT_ALLOW_REGISTRATION", True)

    def populate_user(
        self,
        request: HttpRequest,
        sociallogin: SocialLogin,
        data: dict[str, typing.Any],
    ) -> User:
        """
        Populates user information from social provider info.

        See: https://docs.allauth.org/en/latest/socialaccount/advanced.html#creating-and-populating-user-instances
        """
        user = super().populate_user(request, sociallogin, data)
        if not user.name:
            if name := data.get("name"):
                user.name = name
            elif first_name := data.get("first_name"):
                user.name = first_name
                if last_name := data.get("last_name"):
                    user.name += f" {last_name}"
        return user
