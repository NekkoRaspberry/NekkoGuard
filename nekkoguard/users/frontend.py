"""Addresses of the React frontend, as seen from a Django request."""

from __future__ import annotations

from typing import TYPE_CHECKING
from urllib.parse import urlencode

from django.conf import settings

if TYPE_CHECKING:
    from django.http import HttpRequest


def _hostname(host: str) -> str:
    """Host header without its port.

    "pi.local:8000" → "pi.local", "[::1]:8000" → "[::1]" (IPv6 keeps its brackets).
    """
    if host.startswith("["):  # IPv6 literal
        return host[: host.index("]") + 1]
    return host.rsplit(":", 1)[0] if ":" in host else host


def frontend_base_url(request: HttpRequest) -> str:
    """
    The React app's base URL, always ending in "/".

    settings.FRONTEND_URL when set (production: "/"); otherwise the request's own host
    on FRONTEND_PORT, so it works for whatever name or address was used — nothing
    is hardcoded.
    """
    if settings.FRONTEND_URL:
        base = settings.FRONTEND_URL
        return base if base.endswith("/") else f"{base}/"
    hostname = _hostname(request.get_host())
    return f"{request.scheme}://{hostname}:{settings.FRONTEND_PORT}/"


def frontend_url(request: HttpRequest, path: str = "", **query: str) -> str:
    """A frontend page, e.g. frontend_url(request, "login", next="...")."""
    url = f"{frontend_base_url(request)}{path.lstrip('/')}"
    return f"{url}?{urlencode(query)}" if query else url
