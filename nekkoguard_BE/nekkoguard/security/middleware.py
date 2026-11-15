"""Response headers Django has no setting for (CSP, HSTS, nosniff, referrer and
COOP come from Django's own SecurityMiddleware / ContentSecurityPolicyMiddleware)."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import Callable

    from django.http import HttpRequest
    from django.http import HttpResponse

#: Browser features NekkoGuard never uses.
PERMISSIONS_POLICY = (
    "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), "
    "microphone=(), payment=(), usb=(), interest-cohort=()"
)


class SecurityHeadersMiddleware:
    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]):
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        response = self.get_response(request)
        response.headers.setdefault("Permissions-Policy", PERMISSIONS_POLICY)
        # Responses are only for this origin (the frontend proxies /api to Django).
        response.headers.setdefault("Cross-Origin-Resource-Policy", "same-origin")
        return response
