"""API errors the frontend reacts to: ``{"detail": ..., "code": ...}``."""

from __future__ import annotations

import math

from rest_framework.exceptions import APIException
from rest_framework.exceptions import Throttled
from rest_framework.views import exception_handler as drf_exception_handler


class MFARequired(APIException):
    """Tenant administration needs two-factor authentication (organizations.access)."""

    status_code = 403
    default_detail = (
        "Two-factor authentication is required to administer this tenant. "
        "Turn it on in Profile > Security."
    )
    default_code = "mfa_required"


#: Errors whose code the frontend needs (others keep DRF's usual body).
CODED = {"mfa_required", "throttled", "throttle_unavailable"}


def exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if response is None or not isinstance(exc, APIException):
        return response
    code = exc.default_code
    if isinstance(exc, Throttled):
        wait = math.ceil(exc.wait) if exc.wait is not None else None
        response.data = {
            "detail": (
                f"Too many requests. Try again in {wait} seconds."
                if wait
                else "Too many requests. Try again later."
            ),
            "code": "throttled",
            "retry_after": wait,
        }
        if wait:
            response.headers["Retry-After"] = str(wait)
    elif code in CODED:
        response.data = {"detail": str(exc.detail), "code": code}
    return response
