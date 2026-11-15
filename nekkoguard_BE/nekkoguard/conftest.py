from __future__ import annotations

import time
from typing import TYPE_CHECKING

import pytest
from allauth.account.internal.flows.login import AUTHENTICATION_METHODS_SESSION_KEY
from allauth.mfa.totp.internal.auth import TOTP
from allauth.mfa.totp.internal.auth import generate_totp_secret

from nekkoguard.users.tests.factories import UserFactory

if TYPE_CHECKING:
    from django.test import Client

    from nekkoguard.users.models import User

# allauth's session key naming the user the records belong to.
_AUTH_RECORDS_USER_KEY = "account_authentication_methods_user"


@pytest.fixture(autouse=True)
def _media_storage(settings, tmpdir) -> None:
    settings.MEDIA_ROOT = tmpdir.strpath


@pytest.fixture(autouse=True)
def _fresh_cache():
    """Rate-limit counters (and anything else cached) never leak between tests."""
    from django.core.cache import cache  # noqa: PLC0415

    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def user(db) -> User:
    return UserFactory.create()


def enable_totp(user: User) -> None:
    """Give the user an authenticator app (2FA enabled)."""
    TOTP.activate(user, generate_totp_secret())


#: Password of users made by ``verified_user``.
TEST_PASSWORD = "a-Long-and-Unusual-pass-123"  # noqa: S105


def verified_user(password: str = TEST_PASSWORD, **kwargs) -> User:
    """A user who can sign in with email + password (verified primary address)."""
    from allauth.account.models import EmailAddress  # noqa: PLC0415

    user = UserFactory(password=password, **kwargs)
    EmailAddress.objects.create(
        user=user,
        email=user.email,
        verified=True,
        primary=True,
    )
    return user


def totp_code(user: User) -> str:
    """The current code of the user's authenticator app."""
    from allauth.mfa.adapter import get_adapter  # noqa: PLC0415
    from allauth.mfa.models import Authenticator  # noqa: PLC0415
    from allauth.mfa.totp.internal.auth import format_hotp_value  # noqa: PLC0415
    from allauth.mfa.totp.internal.auth import hotp_value  # noqa: PLC0415
    from allauth.mfa.totp.internal.auth import yield_hotp_counters_from_time  # noqa: PLC0415

    authenticator = Authenticator.objects.get(user=user, type=Authenticator.Type.TOTP)
    secret = get_adapter().decrypt(authenticator.data["secret"])
    return format_hotp_value(hotp_value(secret, next(yield_hotp_counters_from_time())))


def login_with_mfa(client: Client, user: User) -> None:
    """Sign in as if password + 2FA code were completed (what allauth records)."""
    client.force_login(user)
    session = client.session
    session[AUTHENTICATION_METHODS_SESSION_KEY] = [
        {"method": "password", "at": time.time(), "email": user.email},
        {"method": "mfa", "at": time.time(), "type": "totp"},
    ]
    session[_AUTH_RECORDS_USER_KEY] = str(user.pk)
    session.save()


def sign_in(client: Client, user: User) -> Client:
    """
    A real session, as after signing in through the app: users with MFA also passed
    their second factor (what Tenant administration requires).
    """
    from allauth.mfa.utils import is_mfa_enabled  # noqa: PLC0415

    if is_mfa_enabled(user):
        login_with_mfa(client, user)
    else:
        client.force_login(user)
    return client


@pytest.fixture
def admin_client(client: Client, admin_user: User) -> Client:
    """The admin requires 2FA: a superuser with TOTP who completed the 2FA step."""
    enable_totp(admin_user)
    login_with_mfa(client, admin_user)
    return client
