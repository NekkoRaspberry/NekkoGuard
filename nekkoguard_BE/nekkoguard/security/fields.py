"""
``EncryptedTextField``: a model field whose value is encrypted before it reaches the
database and decrypted only when read by backend code.

The Python value is a ``Secret``: printing, logging or ``repr()`` shows ``********``;
the plaintext is only available through ``.reveal()``. Values stored before
encryption existed (plain text) still load, and ``manage.py reencrypt_credentials``
encrypts them. Never put the field in a serializer's output.

    class PiholeConnection(models.Model):
        base_url = models.URLField()                 # not a secret
        app_password = EncryptedTextField(blank=True)

    connection.app_password = "…"                    # str or Secret
    password = connection.app_password.reveal()      # only where it is used
"""

from __future__ import annotations

import hmac
from typing import Any

from django import forms
from django.core.exceptions import FieldError
from django.db import models

from . import crypto


class Secret:
    """A decrypted credential that does not leak through str(), repr() or logs."""

    __slots__ = ("_value",)

    def __init__(self, value: str) -> None:
        self._value = value

    def reveal(self) -> str:
        return self._value

    def __repr__(self) -> str:
        return "Secret('********')"

    def __str__(self) -> str:
        return "********"

    def __bool__(self) -> bool:
        return bool(self._value)

    def __eq__(self, other: object) -> bool:
        if isinstance(other, Secret):
            other = other._value
        if not isinstance(other, str):
            return NotImplemented
        return hmac.compare_digest(self._value.encode(), other.encode())

    __hash__ = None  # type: ignore[assignment]


class EncryptedTextField(models.TextField):
    description = "Text encrypted at rest (AES-256-GCM)"

    def contribute_to_class(self, cls, name, *args, **kwargs):
        super().contribute_to_class(cls, name, *args, **kwargs)
        # Associated data: a value only decrypts in the column it was written to.
        self.crypto_context = f"{cls._meta.app_label}.{cls._meta.model_name}.{name}"

    def _secret(self, value: str) -> Secret:
        if crypto.is_encrypted(value):
            return Secret(crypto.decrypt(value, self.crypto_context))
        return Secret(value)  # legacy plain text (encrypted by reencrypt_credentials)

    def from_db_value(self, value, expression, connection):
        return None if value is None else self._secret(value)

    def to_python(self, value: Any):
        if value is None or isinstance(value, Secret):
            return value
        return self._secret(str(value))

    def get_prep_value(self, value: Any):
        if value is None:
            return None
        plaintext = value.reveal() if isinstance(value, Secret) else str(value)
        if plaintext == "":
            return ""  # nothing to protect
        if crypto.is_encrypted(plaintext):
            return plaintext  # already a ciphertext (e.g. copied row)
        return crypto.encrypt(plaintext, self.crypto_context)

    def value_to_string(self, obj) -> str:
        # dumpdata/serialization: ciphertext only, never the plaintext.
        return self.get_prep_value(self.value_from_object(obj)) or ""

    def get_lookup(self, lookup_name):
        if lookup_name != "isnull":
            msg = f"Encrypted fields cannot be filtered with '{lookup_name}'."
            raise FieldError(msg)
        return super().get_lookup(lookup_name)

    def formfield(self, **kwargs):
        kwargs.setdefault("widget", forms.PasswordInput(render_value=False))
        return super().formfield(**kwargs)
