"""
System checks that stop an insecure production configuration from starting.

They run with every management command (``collectstatic`` and ``migrate`` in the
production start-up), so a misconfigured deployment fails loudly instead of running
silently insecure. Development and test settings are not affected.
"""

from __future__ import annotations

import os

from django.conf import settings
from django.core.checks import Error
from django.core.checks import Warning  # noqa: A004
from django.core.checks import register

ONE_DAY = 24 * 60 * 60


def _is_production() -> bool:
    module = getattr(settings, "SETTINGS_MODULE", None) or os.environ.get(
        "DJANGO_SETTINGS_MODULE",
        "",
    )
    return module.endswith(".production")


@register("security")
def production_settings(app_configs, **kwargs):
    if not _is_production():
        return []
    errors = []
    required_true = {
        "SESSION_COOKIE_SECURE": "Session cookies must only travel over HTTPS.",
        "CSRF_COOKIE_SECURE": "CSRF cookies must only travel over HTTPS.",
        "SESSION_COOKIE_HTTPONLY": "Session cookies must not be readable by scripts.",
        "SECURE_CONTENT_TYPE_NOSNIFF": "X-Content-Type-Options: nosniff is required.",
    }
    if settings.DEBUG:
        errors.append(Error("DEBUG must be False in production.", id="nekkoguard.E001"))
    for name, message in required_true.items():
        if not getattr(settings, name, False):
            errors.append(
                Error(f"{name} must be True. {message}", id="nekkoguard.E002"),
            )
    if not settings.SECURE_CSP:
        errors.append(Error("SECURE_CSP must be configured.", id="nekkoguard.E003"))
    if settings.SECURE_HSTS_SECONDS < ONE_DAY:
        errors.append(
            Warning(
                "SECURE_HSTS_SECONDS is below one day: browsers forget HTTPS quickly.",
                id="nekkoguard.W001",
            ),
        )
    if not settings.CREDENTIAL_ENCRYPTION_KEYS:
        errors.append(
            Warning(
                "DJANGO_CREDENTIAL_KEYS is not set: integration credentials cannot be "
                "stored until an encryption key is configured.",
                id="nekkoguard.W002",
            ),
        )
    return errors


@register("security")
def credential_keys(app_configs, **kwargs):
    """Configured keys must be valid everywhere (fail at start, not at first use)."""
    from .crypto import CredentialKeyError  # noqa: PLC0415
    from .crypto import keyring  # noqa: PLC0415

    try:
        keyring.cache_clear()
        keyring()
    except CredentialKeyError as error:
        return [Error(str(error), id="nekkoguard.E010")]
    return []
