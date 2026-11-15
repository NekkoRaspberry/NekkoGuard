# ruff: noqa: S105, S106, S608, SLF001, PT018 - fake test credentials; raw SQL reads ciphertext
"""Integration credentials encrypted at rest (AES-256-GCM, versioned keys, rotation)."""

import base64
import logging
import os

import pytest
from django.core.exceptions import FieldError
from django.core.management import call_command
from django.db import connection
from django.db import models
from django.test.utils import isolate_apps

from nekkoguard.security import checks
from nekkoguard.security import crypto
from nekkoguard.security.fields import EncryptedTextField
from nekkoguard.security.fields import Secret
from nekkoguard.security.management.commands import reencrypt_credentials

pytestmark = pytest.mark.django_db

PEM = (
    "-----BEGIN PRIVATE KEY-----\n"
    "MIIEvAIBADANBgkqhkiG9w0BAQEFAASC\n"
    "-----END PRIVATE KEY-----\n"
)


def new_key() -> str:
    return base64.urlsafe_b64encode(os.urandom(32)).decode()


@pytest.fixture
def keys(settings):
    """Test-only keys; never real secrets."""

    def configure(*entries, active=""):
        settings.CREDENTIAL_ENCRYPTION_KEYS = list(entries)
        settings.CREDENTIAL_ENCRYPTION_ACTIVE_KEY = active
        crypto.keyring.cache_clear()

    configure(f"k1:{new_key()}")
    yield configure
    crypto.keyring.cache_clear()


class TestCryptoService:
    def test_round_trip_and_random_nonce(self, keys):
        first = crypto.encrypt(PEM, "integrations.docker.key")
        second = crypto.encrypt(PEM, "integrations.docker.key")
        assert first != second  # fresh nonce each time
        assert PEM not in first and "PRIVATE" not in first
        assert first.startswith("nkg1$k1$")
        assert crypto.decrypt(first, "integrations.docker.key") == PEM

    def test_tampering_is_detected(self, keys):
        token = crypto.encrypt("app-password", "c")
        prefix, kid, nonce, data = token.split("$")
        flipped = data[:-2] + ("A" if data[-2] != "A" else "B") + data[-1]
        with pytest.raises(crypto.CredentialDecryptionError):
            crypto.decrypt(f"{prefix}${kid}${nonce}${flipped}", "c")

    def test_a_value_only_decrypts_in_its_own_column(self, keys):
        token = crypto.encrypt("app-password", "integrations.pihole.app_password")
        with pytest.raises(crypto.CredentialDecryptionError):
            crypto.decrypt(token, "integrations.docker.tls_key")

    def test_wrong_key_fails_safely(self, keys):
        token = crypto.encrypt("app-password", "c")
        keys(f"k1:{new_key()}")  # same id, different key material
        with pytest.raises(crypto.CredentialDecryptionError) as error:
            crypto.decrypt(token, "c")
        assert "app-password" not in str(error.value)

    def test_missing_keys(self, keys):
        keys()
        with pytest.raises(crypto.CredentialKeyError):
            crypto.encrypt("x", "c")

    def test_unknown_key_id(self, keys):
        token = crypto.encrypt("x", "c")
        keys(f"k2:{new_key()}")
        with pytest.raises(crypto.CredentialKeyError):
            crypto.decrypt(token, "c")

    @pytest.mark.parametrize(
        "entry",
        [
            "no-separator",
            "UPPER:" + "A" * 43,
            "k1:not-base64!!",
            "k1:" + base64.urlsafe_b64encode(b"short").decode(),
        ],
    )
    def test_bad_configuration_is_refused_at_start(self, keys, entry):
        keys(entry)
        problems = checks.credential_keys(None)
        assert [p.id for p in problems] == ["nekkoguard.E010"]
        assert "A" * 20 not in problems[0].msg  # key material never echoed

    def test_active_key_must_exist(self, keys):
        keys(f"k1:{new_key()}", active="k9")
        assert [p.id for p in checks.credential_keys(None)] == ["nekkoguard.E010"]


@pytest.fixture
def credential_model():
    """A throw-away model standing in for a future integration (e.g. Pi-hole)."""
    with isolate_apps("nekkoguard.security"):

        class PiholeConnection(models.Model):
            base_url = models.URLField()
            app_password = EncryptedTextField(blank=True, null=True)

            class Meta:
                app_label = "security"

            def __str__(self) -> str:
                return self.base_url

        with connection.schema_editor() as editor:
            editor.create_model(PiholeConnection)
        yield PiholeConnection
        with connection.schema_editor() as editor:
            editor.delete_model(PiholeConnection)


def raw(model, pk):
    table = model._meta.db_table
    with connection.cursor() as cursor:
        cursor.execute(f"SELECT app_password FROM {table} WHERE id = %s", [pk])
        return cursor.fetchone()[0]


class TestEncryptedField:
    def test_stored_encrypted_read_back_as_a_secret(self, keys, credential_model):
        row = credential_model.objects.create(
            base_url="http://pihole.local",
            app_password="app-pass-123",
        )
        stored = raw(credential_model, row.pk)
        assert stored.startswith("nkg1$k1$") and "app-pass-123" not in stored
        loaded = credential_model.objects.get(pk=row.pk)
        assert isinstance(loaded.app_password, Secret)
        assert loaded.app_password.reveal() == "app-pass-123"
        assert loaded.app_password == "app-pass-123"

    def test_secrets_never_leak_through_str_repr_or_logs(
        self,
        keys,
        credential_model,
        caplog,
    ):
        row = credential_model.objects.create(
            base_url="http://pihole.local",
            app_password="app-pass-123",
        )
        loaded = credential_model.objects.get(pk=row.pk)
        masked_repr = repr(loaded.app_password)
        masked_str = str(loaded.app_password)
        with caplog.at_level(logging.INFO):
            logging.getLogger("test").info(
                "connection %r %s %s",
                masked_repr,
                "<redacted>",
                vars(loaded),
            )
        assert "app-pass-123" not in caplog.text
        assert "app-pass-123" not in repr(loaded.app_password) + str(
            loaded.app_password,
        )

    def test_serialization_exports_ciphertext_only(self, keys, credential_model):
        row = credential_model.objects.create(
            base_url="http://x",
            app_password="app-pass-123",
        )
        field = credential_model._meta.get_field("app_password")
        exported = field.value_to_string(credential_model.objects.get(pk=row.pk))
        assert exported.startswith("nkg1$") and "app-pass-123" not in exported

    def test_cannot_be_searched(self, keys, credential_model):
        with pytest.raises(FieldError):
            list(credential_model.objects.filter(app_password="app-pass-123"))
        assert credential_model.objects.filter(app_password__isnull=True).count() == 0

    def test_empty_and_null_stay_as_they_are(self, keys, credential_model):
        empty = credential_model.objects.create(base_url="http://x", app_password="")
        null = credential_model.objects.create(base_url="http://x", app_password=None)
        assert raw(credential_model, empty.pk) == ""
        assert raw(credential_model, null.pk) is None

    def test_legacy_plaintext_is_encrypted_and_keys_rotate(
        self,
        keys,
        credential_model,
        monkeypatch,
    ):
        monkeypatch.setattr(
            reencrypt_credentials,
            "encrypted_fields",
            lambda: iter(
                [(credential_model, credential_model._meta.get_field("app_password"))],
            ),
        )
        legacy = credential_model.objects.create(base_url="http://x")
        table = credential_model._meta.db_table
        with connection.cursor() as cursor:  # a value stored before encryption existed
            cursor.execute(
                f"UPDATE {table} SET app_password = %s WHERE id = %s",
                ["plain-old", legacy.pk],
            )
        assert (
            credential_model.objects.get(pk=legacy.pk).app_password == "plain-old"
        )  # still usable
        old_key = new_key()
        keys(f"old:{old_key}")
        on_old = credential_model.objects.create(
            base_url="http://x",
            app_password="rotate-me",
        )

        # Rotation: the new key becomes active, the old one still decrypts.
        new_material = new_key()
        keys(f"new:{new_material}", f"old:{old_key}")
        assert credential_model.objects.get(pk=on_old.pk).app_password == "rotate-me"
        call_command("reencrypt_credentials", "--dry-run")
        assert raw(credential_model, on_old.pk).startswith(
            "nkg1$old$",
        )  # dry run: nothing changed
        call_command("reencrypt_credentials")
        assert raw(credential_model, legacy.pk).startswith("nkg1$new$")
        assert raw(credential_model, on_old.pk).startswith("nkg1$new$")

        # The old key can now be retired: everything still decrypts.
        keys(f"new:{new_material}")
        assert credential_model.objects.get(pk=legacy.pk).app_password == "plain-old"
        assert credential_model.objects.get(pk=on_old.pk).app_password == "rotate-me"
        call_command("reencrypt_credentials")  # idempotent: nothing left to do
