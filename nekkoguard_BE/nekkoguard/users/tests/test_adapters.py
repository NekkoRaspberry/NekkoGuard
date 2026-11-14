"""Only well-known email providers may create accounts."""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from django.core.exceptions import ValidationError

from nekkoguard.users.adapters import AccountAdapter
from nekkoguard.users.adapters import SocialAccountAdapter
from nekkoguard.users.adapters import is_allowed_email_domain
from nekkoguard.users.models import User

SIGNUP_URL = "/_allauth/browser/v1/auth/signup"


@pytest.mark.parametrize(
    ("email", "allowed"),
    [
        ("someone@gmail.com", True),
        ("Someone@Outlook.COM", True),
        ("someone@company.example", False),
        ("someone@mail.gmail.com", False),  # subdomains are not the provider itself
        ("", False),
        (None, False),
    ],
)
def test_is_allowed_email_domain(email, allowed):
    assert is_allowed_email_domain(email) is allowed


def test_empty_list_allows_any_domain(settings):
    settings.ACCOUNT_ALLOWED_EMAIL_DOMAINS = []
    assert is_allowed_email_domain("someone@company.example")


def test_clean_email_rejects_unknown_domain():
    with pytest.raises(ValidationError):
        AccountAdapter().clean_email("someone@company.example")
    assert AccountAdapter().clean_email("someone@gmail.com") == "someone@gmail.com"


@pytest.mark.django_db
def test_signup_api_rejects_unknown_domain(client):
    response = client.post(
        SIGNUP_URL,
        {"email": "someone@company.example", "password": "a-Long-pass-123!"},
        content_type="application/json",
    )
    assert response.status_code == 400  # noqa: PLR2004
    assert response.json()["errors"][0]["param"] == "email"
    assert not User.objects.filter(email="someone@company.example").exists()


@pytest.mark.django_db
def test_signup_api_accepts_known_domain(client):
    client.post(
        SIGNUP_URL,
        {"email": "someone@gmail.com", "password": "a-Long-pass-123!"},
        content_type="application/json",
    )
    assert User.objects.filter(email="someone@gmail.com").exists()


@pytest.mark.parametrize(
    ("email", "is_open"),
    [("someone@gmail.com", True), ("someone@company.example", False)],
)
def test_provider_signup_checks_domain(rf, email, is_open):
    sociallogin = SimpleNamespace(user=SimpleNamespace(email=email))
    adapter = SocialAccountAdapter()
    assert adapter.is_open_for_signup(rf.get("/"), sociallogin) is is_open
