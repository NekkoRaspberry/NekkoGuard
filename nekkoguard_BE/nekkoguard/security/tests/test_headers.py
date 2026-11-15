"""Security headers and cookies, read from real HTTP responses."""

import json
import os
import subprocess
import sys

import pytest
from allauth.account.models import EmailAddress
from django.core.checks import Error
from rest_framework.test import APIClient

from nekkoguard.security import checks
from nekkoguard.users.tests.factories import UserFactory

pytestmark = pytest.mark.django_db

PASSWORD = "a-Long-test-passphrase-42"  # noqa: S105 - test data


def assert_common_headers(response):
    csp = response.headers["Content-Security-Policy"]
    assert "default-src 'self'" in csp
    assert "frame-ancestors 'none'" in csp
    assert "object-src 'none'" in csp
    assert "unsafe-eval" not in csp
    assert "unsafe-inline" not in csp
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["Cross-Origin-Opener-Policy"] == "same-origin"
    assert response.headers["Cross-Origin-Resource-Policy"] == "same-origin"
    assert "camera=()" in response.headers["Permissions-Policy"]


@pytest.mark.parametrize(
    "path",
    [
        "/api/users/me/",  # API, anonymous → 403
        "/api/does-not-exist/",  # 404
        "/_allauth/browser/v1/auth/session",  # authentication (allauth headless)
        "/",  # Django HTML page
    ],
)
def test_security_headers_on_every_kind_of_response(client, path):
    assert_common_headers(client.get(path))


def test_security_headers_on_authenticated_api_responses():
    client = APIClient()
    client.force_login(UserFactory())
    response = client.get("/api/users/me/")
    assert response.status_code == 200  # noqa: PLR2004
    assert_common_headers(response)


def test_views_with_their_own_policy_keep_it():
    """Appearance images send a sandboxed CSP: the global policy must not replace it."""
    from nekkoguard.organizations.models import TenantAppearance  # noqa: PLC0415
    from nekkoguard.organizations.tests.factories import TenantFactory  # noqa: PLC0415
    from nekkoguard.organizations.tests.factories import TenantMembershipFactory  # noqa: PLC0415

    tenant = TenantFactory()
    user = UserFactory()
    TenantMembershipFactory(tenant=tenant, user=user)
    TenantAppearance.objects.create(
        tenant=tenant,
        logo=b"\x89PNG fake",
        logo_hash="c" * 16,
    )
    client = APIClient()
    client.force_login(user)
    response = client.get(f"/api/tenants/{tenant.pk}/appearance/logo/")
    assert response.status_code == 200  # noqa: PLR2004
    assert response.headers["Content-Security-Policy"] == "default-src 'none'; sandbox"


def test_hsts_only_over_https_and_only_when_configured(client, settings):
    settings.SECURE_HSTS_SECONDS = 31536000
    settings.SECURE_HSTS_INCLUDE_SUBDOMAINS = False
    settings.SECURE_HSTS_PRELOAD = False
    assert "Strict-Transport-Security" not in client.get("/").headers
    secure = client.get("/", secure=True)
    assert secure.headers["Strict-Transport-Security"] == "max-age=31536000"


def test_production_settings_start_and_are_secure():
    """Load the real production settings (dummy secrets, no Sentry) in a subprocess."""
    script = (
        "import json; from django.conf import settings as s; print(json.dumps({"
        "'hsts': s.SECURE_HSTS_SECONDS, 'sub': s.SECURE_HSTS_INCLUDE_SUBDOMAINS, "
        "'preload': s.SECURE_HSTS_PRELOAD, 'redirect': s.SECURE_SSL_REDIRECT, "
        "'session_secure': s.SESSION_COOKIE_SECURE, "
        "'csrf_secure': s.CSRF_COOKIE_SECURE, "
        "'session_name': s.SESSION_COOKIE_NAME, 'debug': s.DEBUG, "
        "'ignore': s.CACHES['default']['OPTIONS']['IGNORE_EXCEPTIONS']}))"
    )
    env = {
        **os.environ,
        "DJANGO_SETTINGS_MODULE": "config.settings.production",
        "DJANGO_SECRET_KEY": "test-only-" + "x" * 50,
        "DJANGO_ADMIN_URL": "test-admin/",
        "MAILGUN_API_KEY": "test",
        "MAILGUN_DOMAIN": "example.test",
        "SENTRY_DSN": "",
    }
    result = subprocess.run(  # noqa: S603
        [sys.executable, "-c", f"import django; django.setup(); {script}"],
        capture_output=True,
        text=True,
        env=env,
        check=True,
        timeout=120,
    )
    values = json.loads(result.stdout.strip().splitlines()[-1])
    assert values == {
        "hsts": 31536000,
        "sub": False,
        "preload": False,
        "redirect": True,
        "session_secure": True,
        "csrf_secure": True,
        "session_name": "__Secure-sessionid",
        "debug": False,
        "ignore": False,
    }
    check = subprocess.run(
        [sys.executable, "manage.py", "check", "--tag", "security"],
        capture_output=True,
        text=True,
        env=env,
        check=False,
        timeout=120,
    )
    assert check.returncode == 0, check.stdout + check.stderr


def test_cookie_flags_on_a_real_sign_in(settings):
    settings.SESSION_COOKIE_SECURE = True
    settings.CSRF_COOKIE_SECURE = True
    user = UserFactory(password=PASSWORD)
    EmailAddress.objects.create(
        user=user,
        email=user.email,
        verified=True,
        primary=True,
    )
    client = APIClient(enforce_csrf_checks=False)
    response = client.post(
        "/_allauth/browser/v1/auth/login",
        {"email": user.email, "password": PASSWORD},
        format="json",
        secure=True,
    )
    assert response.status_code == 200, response.content  # noqa: PLR2004
    session = response.cookies[settings.SESSION_COOKIE_NAME]
    assert session["httponly"] is True
    assert session["secure"] is True
    assert session["samesite"] == "Lax"
    assert not session["domain"]  # host-only: never shared with other subdomains
    # A browser-session cookie: gone when the browser closes.
    assert not session["expires"]
    csrf = client.get("/_allauth/browser/v1/auth/session", secure=True).cookies.get(
        settings.CSRF_COOKIE_NAME,
    ) or response.cookies.get(settings.CSRF_COOKIE_NAME)
    if csrf is not None:
        assert csrf["secure"] is True
        assert csrf["samesite"] == "Lax"


def test_sign_out_ends_the_session():
    user = UserFactory(password=PASSWORD)
    EmailAddress.objects.create(
        user=user,
        email=user.email,
        verified=True,
        primary=True,
    )
    client = APIClient()
    client.post(
        "/_allauth/browser/v1/auth/login",
        {"email": user.email, "password": PASSWORD},
        format="json",
    )
    assert client.get("/api/users/me/").status_code == 200  # noqa: PLR2004
    client.delete("/_allauth/browser/v1/auth/session")
    assert client.get("/api/users/me/").status_code == 403  # noqa: PLR2004


class TestProductionChecks:
    def run(self, settings, monkeypatch, **overrides):
        monkeypatch.setattr(checks, "_is_production", lambda: True)
        for name, value in overrides.items():
            setattr(settings, name, value)
        return checks.production_settings(None)

    def test_insecure_production_settings_are_refused(self, settings, monkeypatch):
        problems = self.run(
            settings,
            monkeypatch,
            DEBUG=True,
            SESSION_COOKIE_SECURE=False,
            CSRF_COOKIE_SECURE=False,
            SECURE_CSP={},
            SECURE_HSTS_SECONDS=60,
        )
        errors = {p.id for p in problems if isinstance(p, Error)}
        assert {"nekkoguard.E001", "nekkoguard.E002", "nekkoguard.E003"} <= errors
        assert "nekkoguard.W001" in {p.id for p in problems}

    def test_secure_production_settings_pass(self, settings, monkeypatch):
        problems = self.run(
            settings,
            monkeypatch,
            DEBUG=False,
            SESSION_COOKIE_SECURE=True,
            CSRF_COOKIE_SECURE=True,
            SECURE_HSTS_SECONDS=31536000,
            CREDENTIAL_ENCRYPTION_KEYS=["k1:" + "A" * 43],
        )
        assert [p for p in problems if isinstance(p, Error)] == []

    def test_development_settings_are_not_checked(self, settings, monkeypatch):
        monkeypatch.setattr(checks, "_is_production", lambda: False)
        settings.DEBUG = True
        assert checks.production_settings(None) == []
