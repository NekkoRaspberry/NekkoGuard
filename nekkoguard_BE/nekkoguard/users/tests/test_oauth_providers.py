"""External sign-in providers are listed only when their credentials are configured."""

from __future__ import annotations

from http import HTTPStatus

import pytest
from rest_framework.test import APIClient

CONFIG_URL = "/_allauth/browser/v1/config"


def _provider_ids() -> set[str]:
    response = APIClient().get(CONFIG_URL)
    assert response.status_code == HTTPStatus.OK
    return {p["id"] for p in response.json()["data"]["socialaccount"]["providers"]}


@pytest.mark.django_db
def test_no_providers_without_credentials(settings):
    for provider in settings.SOCIALACCOUNT_PROVIDERS.values():
        provider["APPS"] = []
    assert _provider_ids() == set()


@pytest.mark.django_db
def test_configured_providers_are_listed(settings):
    providers = settings.SOCIALACCOUNT_PROVIDERS
    providers["github"]["APPS"] = [{"client_id": "id", "secret": "s"}]
    providers["openid_connect"]["APPS"] = [
        {
            "provider_id": "linkedin",
            "name": "LinkedIn",
            "client_id": "id",
            "secret": "s",
            "settings": {"server_url": "https://www.linkedin.com/oauth"},
        },
    ]
    providers["google"]["APPS"] = []
    assert _provider_ids() == {"github", "linkedin"}
