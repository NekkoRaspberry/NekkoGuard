from django.conf import settings

from nekkoguard.users.frontend import frontend_base_url


def allauth_settings(request):
    """Expose some settings from django-allauth in templates."""
    return {
        "ACCOUNT_ALLOW_REGISTRATION": settings.ACCOUNT_ALLOW_REGISTRATION,
    }


def app_version(request):
    """Backend release (pyproject.toml `version`) for templates."""
    return {"APP_VERSION": settings.APP_VERSION}


def frontend_url(request):
    """`FRONTEND_URL` for templates: the React app's address (see users/frontend.py)."""
    return {"FRONTEND_URL": frontend_base_url(request)}
