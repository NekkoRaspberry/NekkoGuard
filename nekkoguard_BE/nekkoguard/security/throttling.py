"""
API rate limiting (Django REST Framework throttles on the Redis-backed default cache).

Every API view gets the default throttles (``DEFAULT_THROTTLE_CLASSES``):

- ``AnonRateThrottle``  — anonymous requests, per client IP;
- ``UserRateThrottle``  — signed-in requests, per user id (whatever Tenant/Organization
  the request is about, so switching context does not reset the limit);
- ``IPRateThrottle``    — every request, per client IP (many accounts behind one IP).

Sensitive operations add ``SensitiveRateThrottle`` (``SensitiveThrottleMixin`` on the
view, scope in ``throttle_scope``): per user, or per IP when anonymous.

Client IP: DRF trusts exactly ``REST_FRAMEWORK["NUM_PROXIES"]`` (DJANGO_TRUSTED_PROXIES)
hops of X-Forwarded-For; anything a client adds in front is ignored.

Redis down: general throttles let requests through (logged); sensitive throttles
refuse with 503 (failing open would remove brute-force protection exactly when an
attacker could cause the outage). Limits live in settings (``DEFAULT_THROTTLE_RATES``).
"""

from __future__ import annotations

import logging

from rest_framework import throttling
from rest_framework.exceptions import APIException

logger = logging.getLogger(__name__)


class ThrottleUnavailable(APIException):
    status_code = 503
    default_detail = "This action is temporarily unavailable. Please try again shortly."
    default_code = "throttle_unavailable"


class _FailPolicy:
    #: True: refuse (503) when the rate-limit store cannot be reached.
    fail_closed = False

    def allow_request(self, request, view) -> bool:
        try:
            return super().allow_request(request, view)  # type: ignore[misc]
        except APIException:
            raise
        except Exception:
            scope = getattr(self, "scope", None) or "default"
            if self.fail_closed:
                logger.exception(
                    "Rate-limit store unavailable; refusing scope %s",
                    scope,
                )
                raise ThrottleUnavailable from None
            logger.warning("Rate-limit store unavailable; allowing scope %s", scope)
            return True


class AnonRateThrottle(_FailPolicy, throttling.AnonRateThrottle):
    scope = "anon"


class UserRateThrottle(_FailPolicy, throttling.UserRateThrottle):
    """Signed-in users only (anonymous requests are AnonRateThrottle's job)."""

    scope = "user"

    def get_cache_key(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return None
        return self.cache_format % {"scope": self.scope, "ident": request.user.pk}


class IPRateThrottle(_FailPolicy, throttling.SimpleRateThrottle):
    scope = "ip"

    def get_cache_key(self, request, view):
        return self.cache_format % {
            "scope": self.scope,
            "ident": self.get_ident(request),
        }


class SensitiveRateThrottle(_FailPolicy, throttling.ScopedRateThrottle):
    """Stricter, per-operation limits (view.throttle_scope); fails closed."""

    fail_closed = True


class SensitiveThrottleMixin:
    """
    Adds ``SensitiveRateThrottle`` on top of the defaults for this view's
    ``throttle_scope``. By default only for changes (POST/PUT/PATCH/DELETE); set
    ``sensitive_methods = None`` to limit every method (e.g. anonymous link lookups).
    """

    throttle_scope: str | None = None
    sensitive_methods: frozenset[str] | None = frozenset(
        {"POST", "PUT", "PATCH", "DELETE"},
    )

    def get_throttles(self):
        throttles = list(super().get_throttles())  # type: ignore[misc]
        method = self.request.method  # type: ignore[attr-defined]
        if self.throttle_scope and (
            self.sensitive_methods is None or method in self.sensitive_methods
        ):
            throttles.append(SensitiveRateThrottle())
        return throttles
