from __future__ import annotations

from http import HTTPStatus
from typing import TYPE_CHECKING

import pytest

if TYPE_CHECKING:
    from django.test import Client

    from nekkoguard.users.models import User


@pytest.mark.django_db
def test_home_anonymous(client: Client):
    response = client.get("/")
    assert response.status_code == HTTPStatus.OK
    assert b"You are not signed in." in response.content
    assert b"btn btn-success" in response.content  # Admin button
    assert b'href="/admin/"' in response.content


def test_home_shows_signed_in_user(client: Client, user: User):
    user.name = "Ada Lovelace"
    user.save(update_fields=["name"])
    client.force_login(user)

    response = client.get("/")

    assert response.status_code == HTTPStatus.OK
    assert b"Ada Lovelace" in response.content
    assert user.email.encode() in response.content


@pytest.mark.django_db
@pytest.mark.parametrize(
    "path",
    ["/about/", "/users/1/", "/users/~update/", "/users/~redirect/"],
)
def test_legacy_pages_removed(client: Client, path: str):
    # Profile and account pages live in the React frontend.
    assert client.get(path).status_code == HTTPStatus.NOT_FOUND
