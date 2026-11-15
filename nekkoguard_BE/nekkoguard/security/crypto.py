"""
Encryption of integration credentials at rest (Pi-hole app passwords, Docker TLS/SSH
private keys, future integration secrets).

- AES-256-GCM (authenticated encryption) from the ``cryptography`` package.
- A fresh 96-bit random nonce per encryption.
- The value is bound to where it is stored (``app.model.field``) as associated data,
  so a ciphertext copied into another column does not decrypt.
- Stored as ``nkg1$<key id>$<nonce>$<ciphertext>`` (base64url): the key id makes
  rotation possible — old keys keep decrypting, new values use the active key, and
  ``manage.py reencrypt_credentials`` moves everything to the active key.

Keys come only from the environment (never ``SECRET_KEY``, never generated at start):

    DJANGO_CREDENTIAL_KEYS="2026a:<base64 32 bytes>,2025b:<base64 32 bytes>"
    DJANGO_CREDENTIAL_ACTIVE_KEY="2026a"          # default: the first key listed

Generate a key (base64 of 32 random bytes):

    python manage.py generate_credential_key
"""

from __future__ import annotations

import base64
import binascii
import os
import re
from dataclasses import dataclass
from functools import cache

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.conf import settings

PREFIX = "nkg1"
KEY_BYTES = 32
NONCE_BYTES = 12
_KEY_ID = re.compile(r"^[a-z0-9_-]{1,32}$")


class CredentialKeyError(Exception):
    """Encryption keys are missing or misconfigured (never contains key material)."""


class CredentialDecryptionError(Exception):
    """A stored value could not be decrypted (tampered, wrong key or wrong column)."""


@dataclass(frozen=True)
class Keyring:
    active_id: str | None
    keys: dict[str, AESGCM]


def _b64decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode()


@cache
def keyring() -> Keyring:
    keys: dict[str, AESGCM] = {}
    for entry in settings.CREDENTIAL_ENCRYPTION_KEYS:
        key_id, sep, material = str(entry).strip().partition(":")
        if not sep or not _KEY_ID.match(key_id):
            msg = (
                "DJANGO_CREDENTIAL_KEYS entries must look like '<key id>:<base64 key>'."
            )
            raise CredentialKeyError(msg)
        try:
            raw = _b64decode(material.strip())
        except binascii.Error, ValueError:
            msg = f"Credential key '{key_id}' is not valid base64."
            raise CredentialKeyError(msg) from None
        if len(raw) != KEY_BYTES:
            msg = f"Credential key '{key_id}' must be {KEY_BYTES} bytes (256 bits)."
            raise CredentialKeyError(msg)
        if key_id in keys:
            msg = f"Credential key '{key_id}' is listed twice."
            raise CredentialKeyError(msg)
        keys[key_id] = AESGCM(raw)
    active = settings.CREDENTIAL_ENCRYPTION_ACTIVE_KEY or next(iter(keys), None)
    if active is not None and active not in keys:
        msg = (
            f"DJANGO_CREDENTIAL_ACTIVE_KEY '{active}' is not in DJANGO_CREDENTIAL_KEYS."
        )
        raise CredentialKeyError(msg)
    return Keyring(active_id=active, keys=keys)


def generate_key() -> str:
    """A new random 256-bit key, base64url-encoded, for DJANGO_CREDENTIAL_KEYS."""
    return base64.urlsafe_b64encode(os.urandom(KEY_BYTES)).decode()


def is_encrypted(value: object) -> bool:
    return isinstance(value, str) and value.startswith(f"{PREFIX}$")


def key_id_of(value: str) -> str | None:
    parts = value.split("$")
    return parts[1] if is_encrypted(value) and len(parts) == 4 else None  # noqa: PLR2004


def encrypt(plaintext: str, context: str) -> str:
    ring = keyring()
    if ring.active_id is None:
        msg = "No credential encryption key is configured (DJANGO_CREDENTIAL_KEYS)."
        raise CredentialKeyError(msg)
    nonce = os.urandom(NONCE_BYTES)
    ciphertext = ring.keys[ring.active_id].encrypt(
        nonce,
        plaintext.encode(),
        context.encode(),
    )
    return "$".join([PREFIX, ring.active_id, _b64encode(nonce), _b64encode(ciphertext)])


def decrypt(token: str, context: str) -> str:
    parts = token.split("$")
    if len(parts) != 4 or parts[0] != PREFIX:  # noqa: PLR2004
        msg = "Not an encrypted credential."
        raise CredentialDecryptionError(msg)
    _prefix, key_id, nonce, ciphertext = parts
    key = keyring().keys.get(key_id)
    if key is None:
        msg = f"Credential key '{key_id}' is not configured."
        raise CredentialKeyError(msg)
    try:
        return key.decrypt(
            _b64decode(nonce),
            _b64decode(ciphertext),
            context.encode(),
        ).decode()
    except InvalidTag, binascii.Error, ValueError:
        msg = "The credential could not be decrypted."
        raise CredentialDecryptionError(msg) from None
