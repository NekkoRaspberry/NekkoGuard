"""
Terms of Service enforcement for the API.

While a user has a Tenant's current Terms to accept, every ``/api/`` request answers
**403** ``{"code": "terms_acceptance_required"}`` — whatever the page, tab or client
(session or DRF token) — except the few endpoints needed to read, accept or decline
the Terms and to know who is signed in. Sign-in, sign-out and session endpoints live
under ``/_allauth/`` and are never blocked, so a user can always leave.

Checked on every request (one indexed query), so a version published while users
are signed in applies to their very next request: no forced logout needed.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.http import JsonResponse
from django.utils.translation import gettext as _

from . import terms

if TYPE_CHECKING:
    from collections.abc import Callable

    from django.http import HttpRequest
    from django.http import HttpResponse

TERMS_REQUIRED_CODE = "terms_acceptance_required"

#: Reachable while acceptance is pending (prefix match).
ALLOWED_PREFIXES = (
    "/api/terms/",  # pending Terms, accept, decline
    "/api/users/me/",  # who is signed in
    "/api/impersonation/",  # "view as" status (superusers)
    "/api/oauth/profile/",  # OAuth2 apps (Bearer tokens; not a NekkoGuard session)
)


def _token_user(request: HttpRequest):
    """DRF ``Authorization: Token …`` clients are checked too (resolved here because
    DRF authenticates later, inside the view)."""
    header = request.headers.get("Authorization", "")
    scheme, _sep, key = header.partition(" ")
    if scheme.lower() != "token" or not key.strip():
        return None
    from rest_framework.authtoken.models import Token  # noqa: PLC0415

    token = Token.objects.select_related("user").filter(key=key.strip()).first()
    return token.user if token is not None else None


class TermsAcceptanceMiddleware:
    """Must come after ImpersonationMiddleware (``request.real_user``)."""

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]):
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        if self._blocked(request):
            return JsonResponse(
                {
                    "detail": _("Accept the Terms of Service to continue."),
                    "code": TERMS_REQUIRED_CODE,
                },
                status=403,
            )
        return self.get_response(request)

    def _blocked(self, request: HttpRequest) -> bool:
        path = request.path
        if not path.startswith("/api/") or path.startswith(ALLOWED_PREFIXES):
            return False
        # A superuser viewing as someone (read-only) is never asked to accept for them.
        if getattr(request, "real_user", None) is not None:
            return False
        user = request.user if request.user.is_authenticated else _token_user(request)
        return user is not None and terms.has_pending(user)
