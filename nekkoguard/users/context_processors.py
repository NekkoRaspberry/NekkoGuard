from django.conf import settings


def allauth_settings(request):
    """Expose some settings from django-allauth in templates."""
    return {
        "ACCOUNT_ALLOW_REGISTRATION": settings.ACCOUNT_ALLOW_REGISTRATION,
    }


def app_version(request):
    """Backend release (pyproject.toml `version`) for templates."""
    return {"APP_VERSION": settings.APP_VERSION}


def _hostname(host: str) -> str:
    """Host header without its port.

    "pi.local:8000" → "pi.local", "[::1]:8000" → "[::1]" (IPv6 keeps its brackets).
    """
    if host.startswith("["):  # IPv6 literal
        return host[: host.index("]") + 1]
    return host.rsplit(":", 1)[0] if ":" in host else host


def frontend_url(request):
    """
    `FRONTEND_URL` for templates: the React app's address.

    Uses settings.FRONTEND_URL when set (production: "/"). Otherwise it is built from
    the request's own host with FRONTEND_PORT, so it works for whatever name or address
    the user browsed to — nothing is hardcoded.
    """
    if settings.FRONTEND_URL:
        return {"FRONTEND_URL": settings.FRONTEND_URL}
    hostname = _hostname(request.get_host())
    return {"FRONTEND_URL": f"{request.scheme}://{hostname}:{settings.FRONTEND_PORT}/"}
