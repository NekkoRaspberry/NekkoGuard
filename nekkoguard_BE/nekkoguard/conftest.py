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


@pytest.fixture
def user(db) -> User:
    return UserFactory.create()


def enable_totp(user: User) -> None:
    """Give the user an authenticator app (2FA enabled)."""
    TOTP.activate(user, generate_totp_secret())


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


@pytest.fixture
def admin_client(client: Client, admin_user: User) -> Client:
    """The admin requires 2FA: a superuser with TOTP who completed the 2FA step."""
    enable_totp(admin_user)
    login_with_mfa(client, admin_user)
    return client
