# ruff: noqa: ERA001, E501
"""Base settings to build other settings files upon."""
import os
import ssl
import tomllib
from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve(strict=True).parent.parent.parent
# nekkoguard/
APPS_DIR = BASE_DIR / "nekkoguard"


def _read_version() -> str:
    """Release number from pyproject.toml (the single source of truth)."""
    try:
        with (BASE_DIR / "pyproject.toml").open("rb") as f:
            return tomllib.load(f)["project"]["version"]
    except (OSError, KeyError, tomllib.TOMLDecodeError):
        return "unknown"


# Backend release shown in the navbar of Django's own pages.
APP_VERSION = _read_version()
env = environ.Env()

READ_DOT_ENV_FILE = env.bool("DJANGO_READ_DOT_ENV_FILE", default=False)
if READ_DOT_ENV_FILE:
    # OS environment variables take precedence over variables from .env
    env.read_env(str(BASE_DIR / ".env"))

# GENERAL
# ------------------------------------------------------------------------------
# https://docs.djangoproject.com/en/dev/ref/settings/#debug
DEBUG = env.bool("DJANGO_DEBUG", False)
# Local time zone. Choices are
# http://en.wikipedia.org/wiki/List_of_tz_zones_by_name
# though not all of them may be available with every OS.
# In Windows, this must be set to your system time zone.
TIME_ZONE = "Europe/Lisbon"
# https://docs.djangoproject.com/en/dev/ref/settings/#language-code
LANGUAGE_CODE = "en-us"
# https://docs.djangoproject.com/en/dev/ref/settings/#languages
# from django.utils.translation import gettext_lazy as _
# LANGUAGES = [
#     ('en', _('English')),
#     ('fr-fr', _('French')),
#     ('pt-br', _('Portuguese')),
# ]
# https://docs.djangoproject.com/en/dev/ref/settings/#site-id
SITE_ID = 1
# https://docs.djangoproject.com/en/dev/ref/settings/#use-i18n
USE_I18N = True
# https://docs.djangoproject.com/en/dev/ref/settings/#use-tz
USE_TZ = True
# https://docs.djangoproject.com/en/dev/ref/settings/#locale-paths
LOCALE_PATHS = [str(BASE_DIR / "locale")]

# DATABASES
# ------------------------------------------------------------------------------
# https://docs.djangoproject.com/en/dev/ref/settings/#databases

if os.getenv("DATABASE_URL", default=None):
    DATABASES = {"default": env.db("DATABASE_URL")}
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": env.str("POSTGRES_DB"),
            "USER": env.str("POSTGRES_USER"),
            "PASSWORD": env.str("POSTGRES_PASSWORD"),
            "HOST": env.str("POSTGRES_HOST", default="postgres"),
            "PORT": env.str("POSTGRES_PORT", default="5432"),
        },
    }

DATABASES["default"]["ATOMIC_REQUESTS"] = True
# https://docs.djangoproject.com/en/stable/ref/settings/#std:setting-DEFAULT_AUTO_FIELD
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# URLS
# ------------------------------------------------------------------------------
# https://docs.djangoproject.com/en/dev/ref/settings/#root-urlconf
ROOT_URLCONF = "config.urls"
# https://docs.djangoproject.com/en/dev/ref/settings/#wsgi-application
WSGI_APPLICATION = "config.wsgi.application"

# APPS
# ------------------------------------------------------------------------------
DJANGO_APPS = [
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.sites",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # "django.contrib.humanize", # Handy template tags
    "django.contrib.admin",
    "django.forms",
]
THIRD_PARTY_APPS = [
    "crispy_forms",
    "crispy_bootstrap5",
    "allauth",
    "allauth.account",
    "allauth.headless",
    "allauth.mfa",
    "allauth.socialaccount",
    # External sign-in providers (each is active only when its credentials are set,
    # see SOCIALACCOUNT_PROVIDERS below). LinkedIn uses OpenID Connect.
    "allauth.socialaccount.providers.google",
    "allauth.socialaccount.providers.github",
    "allauth.socialaccount.providers.openid_connect",
    "django_celery_beat",
    "rest_framework",
    "rest_framework.authtoken",
    "corsheaders",
    "drf_spectacular",
    "oauth2_provider",
]

LOCAL_APPS = [
    "nekkoguard.users",
    # Your stuff: custom apps go here
]
# https://docs.djangoproject.com/en/dev/ref/settings/#installed-apps
INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

# MIGRATIONS
# ------------------------------------------------------------------------------
# https://docs.djangoproject.com/en/dev/ref/settings/#migration-modules
MIGRATION_MODULES = {"sites": "nekkoguard.contrib.sites.migrations"}

# AUTHENTICATION
# ------------------------------------------------------------------------------
# https://docs.djangoproject.com/en/dev/ref/settings/#authentication-backends
AUTHENTICATION_BACKENDS = [
    "django.contrib.auth.backends.ModelBackend",
    "allauth.account.auth_backends.AuthenticationBackend",
]
# https://docs.djangoproject.com/en/dev/ref/settings/#auth-user-model
AUTH_USER_MODEL = "users.User"
# https://docs.djangoproject.com/en/dev/ref/settings/#login-redirect-url
LOGIN_REDIRECT_URL = "home"
# https://docs.djangoproject.com/en/dev/ref/settings/#login-url
# The React frontend's sign-in page (allauth's HTML login is disabled: HEADLESS_ONLY).
LOGIN_URL = "/login"

# PASSWORDS
# ------------------------------------------------------------------------------
# https://docs.djangoproject.com/en/dev/ref/settings/#password-hashers
PASSWORD_HASHERS = [
    # https://docs.djangoproject.com/en/dev/topics/auth/passwords/#using-argon2-with-django
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2SHA1PasswordHasher",
    "django.contrib.auth.hashers.BCryptSHA256PasswordHasher",
]
# https://docs.djangoproject.com/en/dev/ref/settings/#auth-password-validators
AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# MIDDLEWARE
# ------------------------------------------------------------------------------
# https://docs.djangoproject.com/en/dev/ref/settings/#middleware
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.locale.LocaleMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "allauth.account.middleware.AccountMiddleware",
]

# STATIC
# ------------------------------------------------------------------------------
# https://docs.djangoproject.com/en/dev/ref/settings/#static-root
STATIC_ROOT = str(BASE_DIR / "staticfiles")
# https://docs.djangoproject.com/en/dev/ref/settings/#static-url
STATIC_URL = "/static/"
# https://docs.djangoproject.com/en/dev/ref/contrib/staticfiles/#std:setting-STATICFILES_DIRS
STATICFILES_DIRS = [str(APPS_DIR / "static")]
# https://docs.djangoproject.com/en/dev/ref/contrib/staticfiles/#staticfiles-finders
STATICFILES_FINDERS = [
    "django.contrib.staticfiles.finders.FileSystemFinder",
    "django.contrib.staticfiles.finders.AppDirectoriesFinder",
]

# MEDIA
# ------------------------------------------------------------------------------
# https://docs.djangoproject.com/en/dev/ref/settings/#media-root
MEDIA_ROOT = str(APPS_DIR / "media")
# https://docs.djangoproject.com/en/dev/ref/settings/#media-url
MEDIA_URL = "/media/"

# TEMPLATES
# ------------------------------------------------------------------------------
# https://docs.djangoproject.com/en/dev/ref/settings/#templates
TEMPLATES = [
    {
        # https://docs.djangoproject.com/en/dev/ref/settings/#std:setting-TEMPLATES-BACKEND
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        # https://docs.djangoproject.com/en/dev/ref/settings/#dirs
        "DIRS": [str(APPS_DIR / "templates")],
        # https://docs.djangoproject.com/en/dev/ref/settings/#app-dirs
        "APP_DIRS": True,
        "OPTIONS": {
            # https://docs.djangoproject.com/en/dev/ref/settings/#template-context-processors
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.template.context_processors.i18n",
                "django.template.context_processors.media",
                "django.template.context_processors.static",
                "django.template.context_processors.tz",
                "django.contrib.messages.context_processors.messages",
                "nekkoguard.users.context_processors.allauth_settings",
                "nekkoguard.users.context_processors.frontend_url",
                "nekkoguard.users.context_processors.app_version",
            ],
        },
    },
]

# https://docs.djangoproject.com/en/dev/ref/settings/#form-renderer
FORM_RENDERER = "django.forms.renderers.TemplatesSetting"

# http://django-crispy-forms.readthedocs.io/en/latest/install.html#template-packs
CRISPY_TEMPLATE_PACK = "bootstrap5"
CRISPY_ALLOWED_TEMPLATE_PACKS = "bootstrap5"

# FIXTURES
# ------------------------------------------------------------------------------
# https://docs.djangoproject.com/en/dev/ref/settings/#fixture-dirs
FIXTURE_DIRS = (str(APPS_DIR / "fixtures"),)

# SECURITY
# ------------------------------------------------------------------------------
# https://docs.djangoproject.com/en/dev/ref/settings/#session-cookie-httponly
SESSION_COOKIE_HTTPONLY = True
# https://docs.djangoproject.com/en/dev/ref/settings/#csrf-cookie-httponly
# False: the React frontend (same origin) must read the CSRF token from this cookie and
# send it back as the X-CSRFToken header. Django's docs note an HttpOnly CSRF cookie adds no
# practical protection; the session cookie itself stays HttpOnly.
CSRF_COOKIE_HTTPONLY = False
# https://docs.djangoproject.com/en/dev/ref/settings/#x-frame-options
X_FRAME_OPTIONS = "DENY"

# EMAIL
# ------------------------------------------------------------------------------
# https://docs.djangoproject.com/en/dev/ref/settings/#email-backend
EMAIL_BACKEND = env(
    "DJANGO_EMAIL_BACKEND",
    default="django.core.mail.backends.smtp.EmailBackend",
)
# https://docs.djangoproject.com/en/dev/ref/settings/#email-timeout
EMAIL_TIMEOUT = 5

# FRONTEND
# ------------------------------------------------------------------------------
# Where the "NekkoGuard" brand on Django's own pages points: the React frontend.
# Empty = same host the request came in on, at FRONTEND_PORT. In local/dev Django
# runs on :8000 and the frontend on :8080 of the same machine, so browsing to
# http://<host>:8000/ links to http://<host>:8080/ — no address is hardcoded.
# Production overrides this with "/" (frontend and backend share one domain).
FRONTEND_URL = env("DJANGO_FRONTEND_URL", default="")
FRONTEND_PORT = env.int("DJANGO_FRONTEND_PORT", default=8080)

# ADMIN
# ------------------------------------------------------------------------------
# Django Admin URL.
ADMIN_URL = "admin/"
# https://docs.djangoproject.com/en/dev/ref/settings/#admins
ADMINS = ['"Diogo Chaves" <diogochavesn5@gmail.com>']
# https://docs.djangoproject.com/en/dev/ref/settings/#managers
MANAGERS = ADMINS
# Admin sign-in always goes through the React frontend with 2FA:
# see nekkoguard/users/admin_auth.py.

# LOGGING
# ------------------------------------------------------------------------------
# https://docs.djangoproject.com/en/dev/ref/settings/#logging
# See https://docs.djangoproject.com/en/dev/topics/logging for
# more details on how to customize your logging configuration.
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "%(levelname)s %(asctime)s %(module)s %(process)d %(thread)d %(message)s",
        },
    },
    "handlers": {
        "console": {
            "level": "DEBUG",
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        },
    },
    "root": {"level": "INFO", "handlers": ["console"]},
}

REDIS_URL = env("REDIS_URL", default="redis://redis:6379/0")
REDIS_SSL = REDIS_URL.startswith("rediss://")

# Celery
# ------------------------------------------------------------------------------
if USE_TZ:
    # https://docs.celeryq.dev/en/stable/userguide/configuration.html#std:setting-timezone
    CELERY_TIMEZONE = TIME_ZONE
# https://docs.celeryq.dev/en/stable/userguide/configuration.html#std:setting-broker_url
CELERY_BROKER_URL = REDIS_URL
# https://docs.celeryq.dev/en/stable/userguide/configuration.html#redis-backend-use-ssl
CELERY_BROKER_USE_SSL = {"ssl_cert_reqs": ssl.CERT_NONE} if REDIS_SSL else None
# https://docs.celeryq.dev/en/stable/userguide/configuration.html#std:setting-result_backend
CELERY_RESULT_BACKEND = REDIS_URL
# https://docs.celeryq.dev/en/stable/userguide/configuration.html#redis-backend-use-ssl
CELERY_REDIS_BACKEND_USE_SSL = CELERY_BROKER_USE_SSL
# https://docs.celeryq.dev/en/stable/userguide/configuration.html#result-extended
CELERY_RESULT_EXTENDED = True
# https://docs.celeryq.dev/en/stable/userguide/configuration.html#result-backend-always-retry
# https://github.com/celery/celery/pull/6122
CELERY_RESULT_BACKEND_ALWAYS_RETRY = True
# https://docs.celeryq.dev/en/stable/userguide/configuration.html#result-backend-max-retries
CELERY_RESULT_BACKEND_MAX_RETRIES = 10
# https://docs.celeryq.dev/en/stable/userguide/configuration.html#std:setting-accept_content
CELERY_ACCEPT_CONTENT = ["json"]
# https://docs.celeryq.dev/en/stable/userguide/configuration.html#std:setting-task_serializer
CELERY_TASK_SERIALIZER = "json"
# https://docs.celeryq.dev/en/stable/userguide/configuration.html#std:setting-result_serializer
CELERY_RESULT_SERIALIZER = "json"
# https://docs.celeryq.dev/en/stable/userguide/configuration.html#task-time-limit
# TODO: set to whatever value is adequate in your circumstances
CELERY_TASK_TIME_LIMIT = 5 * 60
# https://docs.celeryq.dev/en/stable/userguide/configuration.html#task-soft-time-limit
# TODO: set to whatever value is adequate in your circumstances
CELERY_TASK_SOFT_TIME_LIMIT = 60
# https://docs.celeryq.dev/en/stable/userguide/configuration.html#beat-scheduler
CELERY_BEAT_SCHEDULER = "django_celery_beat.schedulers:DatabaseScheduler"
# https://docs.celeryq.dev/en/stable/userguide/configuration.html#worker-send-task-events
CELERY_WORKER_SEND_TASK_EVENTS = True
# https://docs.celeryq.dev/en/stable/userguide/configuration.html#std-setting-task_send_sent_event
CELERY_TASK_SEND_SENT_EVENT = True
# https://docs.celeryq.dev/en/stable/userguide/configuration.html#worker-hijack-root-logger
CELERY_WORKER_HIJACK_ROOT_LOGGER = False
# django-allauth
# ------------------------------------------------------------------------------
ACCOUNT_ALLOW_REGISTRATION = env.bool("DJANGO_ACCOUNT_ALLOW_REGISTRATION", True)
# https://docs.allauth.org/en/latest/account/configuration.html
ACCOUNT_LOGIN_METHODS = {"email"}
# https://docs.allauth.org/en/latest/account/configuration.html
ACCOUNT_SIGNUP_FIELDS = ["email*", "password1*", "password2*"]
# https://docs.allauth.org/en/latest/account/configuration.html
ACCOUNT_USER_MODEL_USERNAME_FIELD = None
# https://docs.allauth.org/en/latest/account/configuration.html
ACCOUNT_EMAIL_VERIFICATION = "mandatory"
# New accounts (email signup, provider signup, adding an email) are only accepted
# from these well-known email providers. Existing accounts are not affected.
# Override with a comma-separated DJANGO_ACCOUNT_ALLOWED_EMAIL_DOMAINS; set it to an
# empty value to accept any domain.
ACCOUNT_ALLOWED_EMAIL_DOMAINS = env.list(
    "DJANGO_ACCOUNT_ALLOWED_EMAIL_DOMAINS",
    default=[
        # Google
        "gmail.com",
        "googlemail.com",
        # Microsoft
        "outlook.com",
        "outlook.pt",
        "hotmail.com",
        "hotmail.co.uk",
        "hotmail.pt",
        "live.com",
        "live.com.pt",
        "msn.com",
        # Apple
        "icloud.com",
        "me.com",
        "mac.com",
        # Yahoo / AOL
        "yahoo.com",
        "yahoo.co.uk",
        "ymail.com",
        "aol.com",
        # Privacy-focused and others
        "proton.me",
        "protonmail.com",
        "pm.me",
        "tutanota.com",
        "zoho.com",
        "gmx.com",
        "gmx.net",
        "mail.com",
        "sapo.pt",
    ],
)
# https://docs.allauth.org/en/latest/account/configuration.html
ACCOUNT_ADAPTER = "nekkoguard.users.adapters.AccountAdapter"
# https://docs.allauth.org/en/latest/account/forms.html
ACCOUNT_FORMS = {"signup": "nekkoguard.users.forms.UserSignupForm"}
# https://docs.allauth.org/en/latest/socialaccount/configuration.html
SOCIALACCOUNT_ADAPTER = "nekkoguard.users.adapters.SocialAccountAdapter"
# https://docs.allauth.org/en/latest/socialaccount/configuration.html
SOCIALACCOUNT_FORMS = {"signup": "nekkoguard.users.forms.UserSocialSignupForm"}

# External sign-in (Google, GitHub, LinkedIn)
# ------------------------------------------------------------------------------
# Credentials come only from the (git-ignored) env file. A provider appears on the
# sign-in page only when both its client ID and secret are set.
# Callback URL to register with each provider (<frontend origin> = e.g. http://<host>:8080):
#   Google:   <frontend origin>/accounts/google/login/callback/
#   GitHub:   <frontend origin>/accounts/github/login/callback/
#   LinkedIn: <frontend origin>/accounts/oidc/linkedin/login/callback/
# https://docs.allauth.org/en/latest/socialaccount/providers/index.html


def _oauth_app(prefix: str, **extra) -> list[dict]:
    client_id = env(f"{prefix}_OAUTH_CLIENT_ID", default="")
    secret = env(f"{prefix}_OAUTH_CLIENT_SECRET", default="")
    if not (client_id and secret):
        return []
    return [{"client_id": client_id, "secret": secret, **extra}]


SOCIALACCOUNT_PROVIDERS = {
    "google": {
        "APPS": _oauth_app("GOOGLE"),
        "SCOPE": ["profile", "email"],
        "AUTH_PARAMS": {"prompt": "select_account"},
    },
    "github": {
        "APPS": _oauth_app("GITHUB"),
        "SCOPE": ["read:user", "user:email"],
    },
    "openid_connect": {
        "APPS": _oauth_app(
            "LINKEDIN",
            provider_id="linkedin",
            name="LinkedIn",
            settings={
                "server_url": "https://www.linkedin.com/oauth",
                "token_auth_method": "client_secret_post",
            },
        ),
    },
}
# Signing in with a provider whose (provider-verified) email belongs to an existing
# account signs into — and links — that account. Unknown emails create a new account
# (only while ACCOUNT_ALLOW_REGISTRATION is on, see users/adapters.py).
SOCIALACCOUNT_EMAIL_AUTHENTICATION = True
SOCIALACCOUNT_EMAIL_AUTHENTICATION_AUTO_CONNECT = True
SOCIALACCOUNT_QUERY_EMAIL = True
# https://docs.allauth.org/en/latest/mfa/configuration.html
MFA_TOTP_ISSUER = "NekkoGuard"

# django-allauth headless (JSON auth API for the React frontend)
# ------------------------------------------------------------------------------
# https://docs.allauth.org/en/latest/headless/configuration.html
# Only the "browser" client: session cookie (HttpOnly) + CSRF, served same-origin.
# The login flow enforces mandatory email verification and 2FA, and logout ends the
# server-side session.
HEADLESS_CLIENTS = ("browser",)
# The React frontend covers every account flow, so allauth's own HTML pages
# (/accounts/...) are turned off.
HEADLESS_ONLY = True
# Links placed in emails / redirects point at the frontend. Relative paths are made
# absolute with the host of the request that triggered them. Headless-only mode
# requires an entry for every URL name allauth may need.
HEADLESS_FRONTEND_URLS = {
    "account_confirm_email": "/verify-email/{key}",
    "account_reset_password": "/forgot-password",
    "account_reset_password_from_key": "/reset-password/{key}",
    "account_signup": "/signup",
    "socialaccount_login_error": "/auth/callback",
}

# django-rest-framework
# -------------------------------------------------------------------------------
# django-rest-framework - https://www.django-rest-framework.org/api-guide/settings/
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework.authentication.SessionAuthentication",
        "rest_framework.authentication.TokenAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
}

# django-cors-headers - https://github.com/adamchainz/django-cors-headers#setup
CORS_URLS_REGEX = r"^/api/.*$"

# By Default swagger ui is available only to admin user(s). You can change permission classes to change that
# See more configuration options at https://drf-spectacular.readthedocs.io/en/latest/settings.html#settings
SPECTACULAR_SETTINGS = {
    "TITLE": "NekkoGuard API",
    "DESCRIPTION": "Documentation of API endpoints of NekkoGuard",
    "VERSION": "1.0.0",
    "SERVE_PERMISSIONS": ["rest_framework.permissions.IsAdminUser"],
    "SCHEMA_PATH_PREFIX": "/api/",
}
# Connected applications: NekkoGuard as an OAuth2 / OpenID Connect provider
# ------------------------------------------------------------------------------
# https://django-oauth-toolkit.readthedocs.io/en/latest/settings.html
# - Apps are registered by staff only (users.oauth API); users approve them on the
#   consent page (/o/authorize/) and can revoke them later.
# - Only the authorization-code flow, PKCE required, read-only "profile" scope.
# - OpenID Connect turns on when a private key file is configured (git-ignored, see
#   OAUTH2_OIDC_PRIVATE_KEY_FILE); without it the server is plain OAuth2.


def _read_oidc_key() -> str:
    path = env("OAUTH2_OIDC_PRIVATE_KEY_FILE", default="")
    if not path:
        return ""
    try:
        return Path(path).read_text()
    except OSError:
        return ""


_OIDC_KEY = _read_oidc_key()
OAUTH2_PROVIDER = {
    "SCOPES": {
        "profile": "Read your NekkoGuard profile (email and name)",
        **({"openid": "Confirm your identity (OpenID Connect)"} if _OIDC_KEY else {}),
    },
    "DEFAULT_SCOPES": ["profile"],
    "PKCE_REQUIRED": True,
    "ACCESS_TOKEN_EXPIRE_SECONDS": 60 * 60,
    "REFRESH_TOKEN_EXPIRE_SECONDS": 30 * 24 * 60 * 60,
    "ROTATE_REFRESH_TOKEN": True,
    "ALLOWED_REDIRECT_URI_SCHEMES": ["http", "https"],
    "OIDC_ENABLED": bool(_OIDC_KEY),
    "OIDC_RSA_PRIVATE_KEY": _OIDC_KEY,
    "OAUTH2_VALIDATOR_CLASS": "nekkoguard.users.oauth.validators.NekkoGuardOAuth2Validator",
}

# Your stuff...
# ------------------------------------------------------------------------------
