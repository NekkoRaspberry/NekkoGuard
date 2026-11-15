# ruff: noqa: PLR2004 - HTTP status codes; long request lines stay readable
"""Two-factor secrets at rest: encrypted, migrated in place, failing closed."""

from io import StringIO

import pytest
from allauth.mfa.models import Authenticator
from allauth.mfa.recovery_codes.internal.auth import RecoveryCodes
from django.core.management import CommandError
from django.core.management import call_command
from django.test import Client

from nekkoguard.conftest import TEST_PASSWORD
from nekkoguard.conftest import enable_totp
from nekkoguard.conftest import totp_code
from nekkoguard.conftest import verified_user
from nekkoguard.security import crypto

pytestmark = pytest.mark.django_db

AUTH = "/_allauth/browser/v1"


@pytest.fixture
def keys(settings):
    """Configure credential keys (the keyring is cached: reset around the test)."""

    def configure(*key_ids, active=""):
        settings.CREDENTIAL_ENCRYPTION_KEYS = [
            f"{k}:{crypto.generate_key()}" for k in key_ids
        ]
        settings.CREDENTIAL_ENCRYPTION_ACTIVE_KEY = active
        crypto.keyring.cache_clear()
        return settings.CREDENTIAL_ENCRYPTION_KEYS

    yield configure
    crypto.keyring.cache_clear()


def stored(user):
    return {a.type: dict(a.data) for a in Authenticator.objects.filter(user=user)}


def legacy_user():
    """MFA set up before keys existed: plain-text secret and seed."""
    user = verified_user()
    enable_totp(user)
    codes = RecoveryCodes.activate(user).get_unused_codes()
    data = stored(user)
    assert not crypto.is_encrypted(data["totp"]["secret"])
    assert not crypto.is_encrypted(data["recovery_codes"]["seed"])
    return user, codes


def second_factor(user, code):
    client = Client()
    client.post(
        f"{AUTH}/auth/login",
        {"email": user.email, "password": TEST_PASSWORD},
        content_type="application/json",
    )
    return client.post(
        f"{AUTH}/auth/2fa/authenticate",
        {"code": code},
        content_type="application/json",
    )


def migrate(*args):
    out = StringIO()
    call_command("reencrypt_credentials", *args, stdout=out)
    return out.getvalue()


def test_new_secrets_are_encrypted_and_never_returned_by_the_api(keys):
    keys("k1")
    user = verified_user()
    enable_totp(user)
    RecoveryCodes.activate(user)
    data = stored(user)
    assert crypto.is_encrypted(data["totp"]["secret"])
    assert crypto.is_encrypted(data["recovery_codes"]["seed"])
    client = Client()
    client.post(
        f"{AUTH}/auth/login",
        {"email": user.email, "password": TEST_PASSWORD},
        content_type="application/json",
    )
    client.post(
        f"{AUTH}/auth/2fa/authenticate",
        {"code": totp_code(user)},
        content_type="application/json",
    )
    body = client.get(f"{AUTH}/account/authenticators").content.decode()
    assert "secret" not in body
    assert data["totp"]["secret"] not in body


def test_legacy_plaintext_secrets_are_migrated_in_place(keys):
    user, codes = legacy_user()
    keys("k1")
    output = migrate()
    assert "allauth.mfa authenticators: 2 to (re-)encrypt" in output
    data = stored(user)
    assert crypto.key_id_of(data["totp"]["secret"]) == "k1"
    assert crypto.key_id_of(data["recovery_codes"]["seed"]) == "k1"
    # Same MFA, no new setup: the app code and the saved recovery codes still work.
    assert second_factor(user, totp_code(user)).status_code == 200
    assert second_factor(user, codes[0]).status_code == 200
    # Nothing secret in the output.
    assert all(code not in output for code in codes)


def test_migration_is_idempotent_and_never_double_encrypts(keys):
    user, _ = legacy_user()
    keys("k1")
    migrate()
    first = stored(user)
    output = migrate()
    assert "allauth.mfa authenticators: 0 to (re-)encrypt" in output
    assert stored(user) == first


def test_dry_run_changes_nothing(keys):
    user, _ = legacy_user()
    keys("k1")
    before = stored(user)
    assert "allauth.mfa authenticators: 2 to (re-)encrypt" in migrate("--dry-run")
    assert stored(user) == before


def test_rotation_moves_secrets_to_the_new_key(keys):
    configured = keys("old")
    user = verified_user()
    enable_totp(user)
    keys_list = [f"new:{crypto.generate_key()}", *configured]
    from django.conf import settings  # noqa: PLC0415

    settings.CREDENTIAL_ENCRYPTION_KEYS = keys_list
    settings.CREDENTIAL_ENCRYPTION_ACTIVE_KEY = "new"
    crypto.keyring.cache_clear()
    migrate()
    assert crypto.key_id_of(stored(user)["totp"]["secret"]) == "new"
    assert second_factor(user, totp_code(user)).status_code == 200


def test_without_keys_the_command_refuses_and_changes_nothing(keys):
    user, _ = legacy_user()
    keys()  # none configured
    before = stored(user)
    with pytest.raises(CommandError):
        migrate()
    assert stored(user) == before


def test_tampered_secret_fails_closed(keys):
    keys("k1")
    user = verified_user()
    enable_totp(user)
    code = totp_code(user)
    authenticator = Authenticator.objects.get(user=user, type=Authenticator.Type.TOTP)
    token = authenticator.data["secret"]
    authenticator.data["secret"] = token[:-4] + (
        "AAAA" if not token.endswith("AAAA") else "BBBB"
    )
    authenticator.save()
    response = second_factor(user, code)
    assert response.status_code == 400  # refused, not a server error, no bypass


def test_missing_key_fails_closed_and_is_left_for_recovery(keys):
    keys("k1")
    user = verified_user()
    enable_totp(user)
    code = totp_code(user)
    before = stored(user)
    keys("k2")  # k1 removed by mistake
    assert second_factor(user, code).status_code == 400
    output = migrate()
    assert "1 value(s) could not be decrypted" in output
    assert stored(user) == before  # untouched: put k1 back and it works again
