"""Admin sign-in: React frontend + required 2FA (see users/admin_auth.py)."""

from __future__ import annotations

from http import HTTPStatus
from typing import TYPE_CHECKING
from urllib.parse import quote

import pytest

from nekkoguard.conftest import enable_totp
from nekkoguard.conftest import login_with_mfa

if TYPE_CHECKING:
    from django.test import Client

    from nekkoguard.users.models import User

FRONTEND_LOGIN = "http://testserver:8080/login?next="


@pytest.fixture
def staff(user: User) -> User:
    user.is_staff = True
    user.save(update_fields=["is_staff"])
    return user


@pytest.mark.django_db
def test_anonymous_is_sent_to_frontend_login(client: Client):
    response = client.get("/admin/login/")
    assert response.status_code == HTTPStatus.FOUND
    assert response.url == FRONTEND_LOGIN + quote("http://testserver/admin/", safe="")


@pytest.mark.django_db
def test_next_is_kept_and_foreign_hosts_ignored(client: Client):
    kept = client.get("/admin/login/?next=/admin/users/user/")
    assert kept.url.endswith(quote("http://testserver/admin/users/user/", safe=""))

    foreign = client.get("/admin/login/?next=https://evil.example/")
    assert foreign.url == FRONTEND_LOGIN + quote("http://testserver/admin/", safe="")


def test_staff_without_2fa_is_refused(client: Client, staff: User):
    client.force_login(staff)
    response = client.get("/admin/login/")
    assert response.status_code == HTTPStatus.FORBIDDEN
    assert b"does not have two-factor authentication enabled" in response.content
    # The admin itself is closed too (redirects to the login view)
    assert client.get("/admin/").status_code == HTTPStatus.FOUND


def test_2fa_user_with_password_only_session_is_refused(client: Client, staff: User):
    enable_totp(staff)
    client.force_login(staff)  # no "mfa" step recorded in the session
    response = client.get("/admin/login/")
    assert response.status_code == HTTPStatus.FORBIDDEN
    assert b"not confirmed with an authentication code" in response.content


def test_staff_with_completed_2fa_gets_in(client: Client, staff: User):
    enable_totp(staff)
    login_with_mfa(client, staff)
    assert client.get("/admin/").status_code == HTTPStatus.OK
    assert client.get("/admin/login/").url == "/admin/"


def test_non_staff_is_refused(client: Client, user: User):
    enable_totp(user)
    login_with_mfa(client, user)
    response = client.get("/admin/login/")
    assert response.status_code == HTTPStatus.FORBIDDEN
    assert b"does not have access to the admin" in response.content


def test_signout_logs_out_and_restarts_frontend_login(client: Client, staff: User):
    client.force_login(staff)
    response = client.post("/admin/signout/")
    assert response.status_code == HTTPStatus.FOUND
    assert response.url.startswith(FRONTEND_LOGIN)
    assert "_auth_user_id" not in client.session


def test_signout_requires_post(client: Client, staff: User):
    client.force_login(staff)
    assert client.get("/admin/signout/").status_code == HTTPStatus.METHOD_NOT_ALLOWED
