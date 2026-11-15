from __future__ import annotations

import base64
import logging
import secrets
import typing

from allauth.account.adapter import DefaultAccountAdapter
from allauth.mfa.adapter import DefaultMFAAdapter
from allauth.socialaccount.adapter import DefaultSocialAccountAdapter
from django.conf import settings
from django.core.exceptions import ValidationError
from django.utils.translation import gettext_lazy as _

from nekkoguard.organizations.invitations import has_open_invitation
from nekkoguard.security import crypto

if typing.TYPE_CHECKING:
    from allauth.socialaccount.models import SocialLogin
    from django.http import HttpRequest

    from nekkoguard.users.models import User

logger = logging.getLogger(__name__)


def is_allowed_email_domain(email: str | None) -> bool:
    """True when the email belongs to a well-known provider (or no list is set)."""
    allowed = {d.strip().lower() for d in settings.ACCOUNT_ALLOWED_EMAIL_DOMAINS if d}
    if not allowed:
        return True
    domain = (email or "").rpartition("@")[2].strip().lower()
    return domain in allowed


#: allauth URL names of "email me a password reset link" (headless JSON / HTML form).
_PASSWORD_RESET_REQUEST_URLS = {"request_password_reset", "account_reset_password"}


def _is_password_reset_request() -> bool:
    from allauth.core import context  # noqa: PLC0415

    match = getattr(context.request, "resolver_match", None)
    return match is not None and match.url_name in _PASSWORD_RESET_REQUEST_URLS


class AccountAdapter(DefaultAccountAdapter):
    def is_open_for_signup(self, request: HttpRequest) -> bool:
        return getattr(settings, "ACCOUNT_ALLOW_REGISTRATION", True)

    def clean_email(self, email: str) -> str:
        """Used by email signup and when adding an email to an account."""
        email = super().clean_email(email)
        if _is_password_reset_request():
            # Not a new address: existing accounts on any domain may reset their
            # password, and every address gets the same generic answer.
            return email
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


#: Associated data of encrypted authenticator values (see security/crypto.py).
MFA_SECRET_CONTEXT = "allauth.mfa.authenticator.data"  # noqa: S105 - a label, not a secret


class MFAAdapter(DefaultMFAAdapter):
    """
    Authenticator-app secrets and recovery-code seeds are encrypted at rest with the
    credential keys (``nekkoguard.security.crypto``) when they are configured.
    Plain-text values stored before that stay readable; ``manage.py
    reencrypt_credentials`` encrypts them in place (no new setup needed).
    """

    def encrypt(self, text: str) -> str:
        if not settings.CREDENTIAL_ENCRYPTION_KEYS:
            return text
        return crypto.encrypt(text, MFA_SECRET_CONTEXT)

    def decrypt(self, encrypted_text: str) -> str:
        if not crypto.is_encrypted(encrypted_text):
            return encrypted_text  # stored before encryption was configured
        try:
            return crypto.decrypt(encrypted_text, MFA_SECRET_CONTEXT)
        except crypto.CredentialDecryptionError, crypto.CredentialKeyError:
            # Tampered value or missing key: fail closed. A fresh random secret
            # matches no code (never an empty or predictable key). Logged without it.
            logger.error("An authenticator secret could not be decrypted.")  # noqa: TRY400
            return base64.b32encode(secrets.token_bytes(32)).decode()
