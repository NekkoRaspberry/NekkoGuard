"""API rate limiting: per user, per IP, per sensitive operation, 429 + Retry-After."""

import pytest
from allauth.account.models import EmailAddress
from django.core.cache import cache
from rest_framework import throttling as drf_throttling
from rest_framework.test import APIClient

from nekkoguard.organizations.tests.factories import TenantFactory
from nekkoguard.organizations.tests.factories import TenantMembershipFactory
from nekkoguard.users.tests.factories import UserFactory

pytestmark = pytest.mark.django_db

UNKNOWN_LINK = (
    "/api/invitations/" + "x" * 32 + "/"
)  # public endpoint (404, but throttled)
RELEASES = "/api/help/releases/"
BIG = "1000/minute"


@pytest.fixture
def rates(monkeypatch):
    """Small, test-only limits (DRF reads them from the throttle class)."""

    def set_rates(**overrides):
        values = {
            "anon": BIG,
            "user": BIG,
            "ip": BIG,
            "invitation_links": BIG,
            "bug_reports": BIG,
            "member_invitations": BIG,
            "access_changes": BIG,
            "admin_changes": BIG,
            "terms_responses": BIG,
            "terms_admin": BIG,
            "appearance_changes": BIG,
            "impersonation": BIG,
        }
        values.update(overrides)
        monkeypatch.setattr(drf_throttling.SimpleRateThrottle, "THROTTLE_RATES", values)

    return set_rates


def signed_in(user=None):
    client = APIClient()
    client.force_login(user or UserFactory())
    return client


def assert_throttled(response):
    assert response.status_code == 429  # noqa: PLR2004
    body = response.json()
    assert body["code"] == "throttled"
    assert int(response.headers["Retry-After"]) == body["retry_after"]
    assert 0 < body["retry_after"] <= 60  # noqa: PLR2004 - within the one-minute window
    assert (
        "throttle" not in body["detail"].lower()
        or "Too many requests" in body["detail"]
    )
    # No internals: no cache keys, user ids or Redis details in the answer.
    assert set(body) == {"detail", "code", "retry_after"}


def test_anonymous_requests_are_limited_per_ip(rates):
    rates(anon="2/minute")
    client = APIClient()
    assert client.get(UNKNOWN_LINK).status_code == 404  # noqa: PLR2004
    assert client.get(UNKNOWN_LINK).status_code == 404  # noqa: PLR2004
    assert_throttled(client.get(UNKNOWN_LINK))


def test_signed_in_users_are_limited_per_user_and_isolated(rates):
    rates(user="3/minute")
    alice, bob = signed_in(), signed_in()
    for _ in range(3):
        assert alice.get(RELEASES).status_code == 200  # noqa: PLR2004
    assert_throttled(alice.get(RELEASES))
    assert bob.get(RELEASES).status_code == 200  # noqa: PLR2004 - own counter


def test_switching_tenant_does_not_reset_the_user_limit(rates):
    rates(user="2/minute")
    user = UserFactory()
    tenant_a, tenant_b = TenantFactory(), TenantFactory()
    TenantMembershipFactory(tenant=tenant_a, user=user)
    TenantMembershipFactory(tenant=tenant_b, user=user)
    client = signed_in(user)
    assert client.get(f"/api/tenants/{tenant_a.pk}/terms/").status_code == 200  # noqa: PLR2004
    assert client.get(f"/api/tenants/{tenant_b.pk}/terms/").status_code == 200  # noqa: PLR2004
    assert_throttled(client.get(f"/api/tenants/{tenant_a.pk}/terms/"))


def test_one_ip_is_limited_across_accounts(rates):
    rates(ip="3/minute")
    clients = [signed_in() for _ in range(4)]
    for client in clients[:3]:
        assert client.get(RELEASES).status_code == 200  # noqa: PLR2004
    assert_throttled(clients[3].get(RELEASES))


def test_spoofed_forwarded_for_is_ignored_without_trusted_proxies(rates, settings):
    rates(anon="2/minute")
    settings.REST_FRAMEWORK = {**settings.REST_FRAMEWORK, "NUM_PROXIES": 0}
    client = APIClient()
    client.get(UNKNOWN_LINK, HTTP_X_FORWARDED_FOR="203.0.113.1")
    client.get(UNKNOWN_LINK, HTTP_X_FORWARDED_FOR="203.0.113.2")
    # A new forged address every time does not give a new allowance.
    assert_throttled(client.get(UNKNOWN_LINK, HTTP_X_FORWARDED_FOR="203.0.113.3"))


def test_only_the_trusted_proxy_hop_counts(rates, settings):
    rates(anon="2/minute")
    settings.REST_FRAMEWORK = {**settings.REST_FRAMEWORK, "NUM_PROXIES": 1}
    client = APIClient()
    # The client forges the first entries; the proxy appends the real address last.
    client.get(UNKNOWN_LINK, HTTP_X_FORWARDED_FOR="198.51.100.7, 192.0.2.10")
    client.get(UNKNOWN_LINK, HTTP_X_FORWARDED_FOR="198.51.100.8, 192.0.2.10")
    assert_throttled(
        client.get(UNKNOWN_LINK, HTTP_X_FORWARDED_FOR="198.51.100.9, 192.0.2.10"),
    )
    # Another real client (another last hop) has its own allowance.
    response = client.get(UNKNOWN_LINK, HTTP_X_FORWARDED_FOR="198.51.100.7, 192.0.2.11")
    assert response.status_code == 404  # noqa: PLR2004


@pytest.mark.django_db(transaction=True)  # the bug report view is non-atomic
def test_sensitive_operations_have_their_own_stricter_limit(rates):
    rates(bug_reports="1/hour")
    client = signed_in()
    assert client.post("/api/bug-reports/", {}).status_code == 400  # noqa: PLR2004 - counted
    response = client.post("/api/bug-reports/", {})
    assert response.status_code == 429  # noqa: PLR2004
    assert int(response.headers["Retry-After"]) > 60  # noqa: PLR2004 - hourly window
    # Reading is not limited by the sensitive scope.
    assert client.get(RELEASES).status_code == 200  # noqa: PLR2004


REDIS_DOWN = "redis down"


class _BrokenCache:
    def get(self, *args, **kwargs):
        raise ConnectionError(REDIS_DOWN)

    def set(self, *args, **kwargs):
        raise ConnectionError(REDIS_DOWN)


def test_redis_down_general_api_keeps_working(rates, monkeypatch):
    rates()
    monkeypatch.setattr(drf_throttling.SimpleRateThrottle, "cache", _BrokenCache())
    assert signed_in().get(RELEASES).status_code == 200  # noqa: PLR2004


@pytest.mark.django_db(transaction=True)
def test_redis_down_sensitive_operations_fail_closed(rates, monkeypatch):
    rates()
    monkeypatch.setattr(drf_throttling.SimpleRateThrottle, "cache", _BrokenCache())
    response = signed_in().post("/api/bug-reports/", {})
    assert response.status_code == 503  # noqa: PLR2004
    assert response.json() == {
        "detail": "This action is temporarily unavailable. Please try again shortly.",
        "code": "throttle_unavailable",
    }
    # Anonymous lookups of secret links are sensitive on every method.
    assert APIClient().get(UNKNOWN_LINK).status_code == 503  # noqa: PLR2004


def test_throttle_keys_are_namespaced_and_hold_no_secrets(rates):
    rates()
    user = UserFactory()
    signed_in(user).get(RELEASES)
    keys = list(getattr(cache, "_cache", {}).keys())
    assert any(f"throttle_user_{user.pk}" in key for key in keys)
    assert not any(user.email in key for key in keys)


def test_failed_sign_ins_are_rate_limited_by_allauth():
    user = UserFactory(password="the-right-passphrase-77")  # noqa: S106
    EmailAddress.objects.create(
        user=user,
        email=user.email,
        verified=True,
        primary=True,
    )
    client = APIClient()
    codes = []
    for _ in range(7):
        response = client.post(
            "/_allauth/browser/v1/auth/login",
            {"email": user.email, "password": "wrong-passphrase"},
            format="json",
        )
        codes.append({e.get("code") for e in response.json().get("errors", [])})
    # "login_failed": 5 per 5 minutes per account. allauth then refuses every attempt
    # (even with the right password) with its own error code.
    assert all("too_many_login_attempts" not in c for c in codes[:5])
    assert all("too_many_login_attempts" in c for c in codes[5:])
    response = client.post(
        "/_allauth/browser/v1/auth/login",
        {"email": user.email, "password": "the-right-passphrase-77"},
        format="json",
    )
    assert response.status_code == 400  # noqa: PLR2004
