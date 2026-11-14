from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.contrib.staticfiles.urls import staticfiles_urlpatterns
from django.urls import include
from django.urls import path
from django.views import defaults as default_views
from django.views.generic import TemplateView
from drf_spectacular.views import SpectacularAPIView
from drf_spectacular.views import SpectacularSwaggerView

from nekkoguard.users.admin_auth import admin_signout
from nekkoguard.users.oauth import urls as oauth_urls

urlpatterns = [
    path("", TemplateView.as_view(template_name="pages/home.html"), name="home"),
    # Admin sign-out used by the "2FA required" page (before the admin's catch-all)
    path(f"{settings.ADMIN_URL}signout/", admin_signout, name="admin_signout"),
    # Django Admin, use {% url 'admin:index' %}. Sign-in: React frontend + 2FA.
    path(settings.ADMIN_URL, admin.site.urls),
    path("accounts/", include("allauth.urls")),
    # Connected applications: OAuth2 / OpenID Connect provider (consent, tokens)
    path(
        "o/",
        include(
            (oauth_urls.provider_urlpatterns, "oauth2_provider"),
            namespace="oauth2_provider",
        ),
    ),
    # JSON authentication API used by the React frontend (django-allauth headless)
    path("_allauth/", include("allauth.headless.urls")),
    # Your stuff: custom urls includes go here
    # ...
    # Media files
    *static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT),
]
if settings.DEBUG:
    # Static file serving when using Gunicorn + Uvicorn for local web socket development
    urlpatterns += staticfiles_urlpatterns()

# API URLS
urlpatterns += [
    # Connected applications: management API + profile resource for approved apps
    path("api/oauth/", include(oauth_urls.api_urlpatterns)),
    # API base url
    path("api/", include("config.api_router")),
    # No public token endpoint: obtain_auth_token checked only email + password,
    # bypassing mandatory email verification and 2FA. Browser clients sign in through
    # /_allauth/; tokens for scripts can be issued by an admin (Django admin → Tokens).
    path("api/schema/", SpectacularAPIView.as_view(), name="api-schema"),
    path(
        "api/docs/",
        SpectacularSwaggerView.as_view(url_name="api-schema"),
        name="api-docs",
    ),
]

if settings.DEBUG:
    # This allows the error pages to be debugged during development, just visit
    # these url in browser to see how these error pages look like.
    urlpatterns += [
        path(
            "400/",
            default_views.bad_request,
            kwargs={"exception": Exception("Bad Request!")},
        ),
        path(
            "403/",
            default_views.permission_denied,
            kwargs={"exception": Exception("Permission Denied")},
        ),
        path(
            "404/",
            default_views.page_not_found,
            kwargs={"exception": Exception("Page not Found")},
        ),
        path("500/", default_views.server_error),
    ]
    if "debug_toolbar" in settings.INSTALLED_APPS:
        import debug_toolbar

        urlpatterns = [
            path("__debug__/", include(debug_toolbar.urls)),
            *urlpatterns,
        ]
