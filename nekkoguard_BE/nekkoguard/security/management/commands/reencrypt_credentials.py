"""
Encrypt plain-text credentials and move every encrypted credential to the active key.

Use after adding an encrypted field to existing data, and when rotating keys:
  1. add the new key first in DJANGO_CREDENTIAL_KEYS (keep the old one), set
     DJANGO_CREDENTIAL_ACTIVE_KEY to it, restart;
  2. run ``python manage.py reencrypt_credentials``;
  3. once it reports 0 values left on old keys, remove the old key and restart.

Also covers two-factor secrets (django-allauth ``Authenticator.data``: the authenticator
app secret, the recovery-code seed and legacy recovery codes): plain-text values from
before encryption was configured are encrypted in place — users keep their MFA set up.
A value that cannot be decrypted (unknown key, tampered) is reported and left as is.

Idempotent; prints counts only — never values.
"""

from __future__ import annotations

from django.apps import apps
from django.core.management.base import BaseCommand
from django.core.management.base import CommandError
from django.db import transaction
from django.db.models import TextField
from django.db.models.functions import Cast

from nekkoguard.security import crypto
from nekkoguard.security.fields import EncryptedTextField


def encrypted_fields():
    for model in apps.get_models():
        for field in model._meta.concrete_fields:  # noqa: SLF001
            if isinstance(field, EncryptedTextField):
                yield model, field


class Command(BaseCommand):
    help = (
        "Encrypt plain-text credentials; re-encrypt old-key values with the active key."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Only count, change nothing.",
        )

    def handle(self, *args, dry_run: bool = False, **options):
        active = crypto.keyring().active_id
        if active is None:
            msg = "No credential encryption key is configured (DJANGO_CREDENTIAL_KEYS)."
            raise CommandError(msg)
        total = 0
        for model, field in encrypted_fields():
            # Raw stored values (Cast skips the field's decryption).
            raw = (
                model._default_manager.exclude(**{f"{field.name}__isnull": True})  # noqa: SLF001
                .annotate(_raw=Cast(field.name, TextField()))
                .values_list("pk", "_raw")
            )
            todo = [
                pk for pk, value in raw if value and crypto.key_id_of(value) != active
            ]
            label = f"{model._meta.label}.{field.name}"  # noqa: SLF001
            self.stdout.write(f"{label}: {len(todo)} value(s) to (re-)encrypt")
            total += len(todo)
            if dry_run:
                continue
            for pk in todo:
                with transaction.atomic():
                    row = model._default_manager.select_for_update().get(pk=pk)  # noqa: SLF001
                    value = getattr(row, field.attname)
                    # update(): re-encrypts with the active key, bypasses save() hooks.
                    manager = model._default_manager  # noqa: SLF001
                    manager.filter(pk=pk).update(**{field.attname: value})
        total += self._mfa_secrets(active, dry_run=dry_run)
        verb = "would be" if dry_run else "were"
        self.stdout.write(
            self.style.SUCCESS(f"{total} credential value(s) {verb} (re-)encrypted."),
        )

    # ------------------------------------------------------------ MFA secrets

    def _mfa_secrets(self, active: str, *, dry_run: bool) -> int:
        from allauth.mfa.models import Authenticator  # noqa: PLC0415

        todo, failed = 0, 0
        for pk in Authenticator.objects.values_list("pk", flat=True):
            with transaction.atomic():
                row = Authenticator.objects.select_for_update().get(pk=pk)
                data, changed, bad = reencrypt_mfa_data(row.data, active)
                failed += bad
                if changed:
                    todo += 1
                    if not dry_run:
                        Authenticator.objects.filter(pk=pk).update(data=data)
        self.stdout.write(
            f"allauth.mfa authenticators: {todo} to (re-)encrypt, "
            f"{failed} value(s) could not be decrypted (left unchanged)",
        )
        return todo


#: Keys of ``Authenticator.data`` holding a secret (str) or a list of secrets.
MFA_SECRET_KEYS = ("secret", "seed", "migrated_codes")


def _reencrypt_value(value: str) -> str | None:
    """The value encrypted with the active key; ``None`` if it cannot be read."""
    from nekkoguard.users.adapters import MFA_SECRET_CONTEXT  # noqa: PLC0415

    if crypto.is_encrypted(value):
        try:
            plaintext = crypto.decrypt(value, MFA_SECRET_CONTEXT)
        except crypto.CredentialDecryptionError, crypto.CredentialKeyError:
            return None
    else:
        plaintext = value
    token = crypto.encrypt(plaintext, MFA_SECRET_CONTEXT)
    if crypto.decrypt(token, MFA_SECRET_CONTEXT) != plaintext:  # pragma: no cover
        return None
    return token


def reencrypt_mfa_data(data: dict, active: str) -> tuple[dict, bool, int]:
    """(new data, changed?, number of unreadable values) — other keys untouched."""
    new = dict(data)
    changed, bad = False, 0

    def convert(value):
        nonlocal changed, bad
        if not isinstance(value, str) or crypto.key_id_of(value) == active:
            return value  # already on the active key: never encrypted twice
        token = _reencrypt_value(value)
        if token is None:
            bad += 1
            return value
        changed = True
        return token

    for key in MFA_SECRET_KEYS:
        if key in new:
            value = new[key]
            new[key] = (
                [convert(v) for v in value]
                if isinstance(value, list)
                else convert(value)
            )
    return new, changed, bad
