"""Connected applications: NekkoGuard as an OAuth2 provider (users/oauth/)."""

from __future__ import annotations

import base64
import hashlib
import secrets
from http import HTTPStatus
from typing import TYPE_CHECKING
from urllib.parse import parse_qs
from urllib.parse import urlparse

import pytest
from rest_framework.test import APIClient

if TYPE_CHECKING:
    from django.test import Client

    from nekkoguard.users.models import User

REDIRECT = "https://app.example.com/callback"


@pytest.fixture
def staff_api(admin_user: User) -> APIClient:
    client = APIClient()
    client.force_authenticate(admin_user)
    return client


@pytest.fixture
def app(staff_api: APIClient) -> dict:
    response = staff_api.post(
        "/api/oauth/applications/",
        {"name": "Grafana", "client_type": "confidential", "redirect_uris": [REDIRECT]},
        format="json",
    )
    assert response.status_code == HTTPStatus.CREATED, response.content
    return response.json()


def _pkce() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(48)
    digest = hashlib.sha256(verifier.encode()).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    return verifier, challenge


def _authorize(client: Client, app: dict, challenge: str, method: str = "S256"):
    return client.get(
        "/o/authorize/",
        {
            "response_type": "code",
            "client_id": app["client_id"],
            "redirect_uri": REDIRECT,
            "scope": "profile",
            "state": "xyz",
            "code_challenge": challenge,
            "code_challenge_method": method,
        },
    )


def _get_token(client: Client, user: User, app: dict) -> str:
    """Full authorization-code flow with PKCE; returns an access token."""
    client.force_login(user)
    verifier, challenge = _pkce()
    consent = _authorize(client, app, challenge)
    assert consent.status_code == HTTPStatus.OK
    assert b"Grafana" in consent.content
    form = {k: v for k, v in consent.context["form"].initial.items() if v is not None}
    approved = client.post("/o/authorize/", {**form, "allow": "Allow"})
    assert approved.status_code == HTTPStatus.FOUND
    query = parse_qs(urlparse(approved.url).query)
    assert query["state"] == ["xyz"]
    token = APIClient().post(
        "/o/token/",
        {
            "grant_type": "authorization_code",
            "code": query["code"][0],
            "redirect_uri": REDIRECT,
            "client_id": app["client_id"],
            "client_secret": app["client_secret"],
            "code_verifier": verifier,
        },
    )
    assert token.status_code == HTTPStatus.OK, token.content
    return token.json()["access_token"]


# --- registration (staff only) -------------------------------------------------


def test_staff_registers_app_and_secret_is_shown_once(staff_api: APIClient, app: dict):
    assert app["client_secret"]
    listed = staff_api.get("/api/oauth/applications/").json()
    assert [a["name"] for a in listed] == ["Grafana"]
    assert "client_secret" not in listed[0]


def test_non_staff_cannot_register(user: User):
    client = APIClient()
    client.force_authenticate(user)
    response = client.post(
        "/api/oauth/applications/",
        {"name": "x", "client_type": "public", "redirect_uris": [REDIRECT]},
        format="json",
    )
    assert response.status_code == HTTPStatus.FORBIDDEN


def test_redirect_uri_scheme_validated(staff_api: APIClient):
    response = staff_api.post(
        "/api/oauth/applications/",
        {
            "name": "x",
            "client_type": "public",
            "redirect_uris": ["ftp://bad.example/cb"],
        },
        format="json",
    )
    assert response.status_code == HTTPStatus.BAD_REQUEST


def test_staff_deletes_app(staff_api: APIClient, app: dict):
    response = staff_api.delete(f"/api/oauth/applications/{app['id']}/")
    assert response.status_code == HTTPStatus.NO_CONTENT
    assert staff_api.get("/api/oauth/applications/").json() == []


# --- authorization flow ----------------------------------------------------------


@pytest.mark.django_db
def test_signed_out_user_is_sent_to_frontend_login(client: Client, app: dict):
    response = _authorize(client, app, _pkce()[1])
    assert response.status_code == HTTPStatus.FOUND
    assert response.url.startswith("http://testserver:8080/login?next=")


def test_plain_pkce_is_rejected(client: Client, user: User, app: dict):
    client.force_login(user)
    response = _authorize(client, app, "x" * 50, method="plain")
    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert b"S256" in response.content


def test_approved_app_reads_profile_only(client: Client, user: User, app: dict):
    token = _get_token(client, user, app)
    bearer = APIClient()
    bearer.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    profile = bearer.get("/api/oauth/profile/")
    assert profile.status_code == HTTPStatus.OK
    assert profile.json() == {"id": user.pk, "email": user.email, "name": user.name}

    # The token is not accepted by the regular API (no writes through OAuth).
    patch = bearer.patch(f"/api/users/{user.pk}/", {"name": "hacked"}, format="json")
    assert patch.status_code in (HTTPStatus.UNAUTHORIZED, HTTPStatus.FORBIDDEN)


def test_user_sees_and_revokes_connected_app(client: Client, user: User, app: dict):
    token = _get_token(client, user, app)
    session_api = APIClient()
    session_api.force_authenticate(user)

    connected = session_api.get("/api/oauth/authorized-apps/").json()
    assert [(a["name"], a["scopes"]) for a in connected] == [("Grafana", ["profile"])]

    revoked = session_api.delete(f"/api/oauth/authorized-apps/{app['id']}/")
    assert revoked.status_code == HTTPStatus.NO_CONTENT
    assert session_api.get("/api/oauth/authorized-apps/").json() == []

    bearer = APIClient()
    bearer.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    assert bearer.get("/api/oauth/profile/").status_code == HTTPStatus.UNAUTHORIZED
