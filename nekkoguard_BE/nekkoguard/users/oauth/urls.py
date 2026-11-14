"""URLs for connected applications (OAuth2 / OpenID Connect provider)."""

from __future__ import annotations

from django.conf import settings
from django.urls import path
from oauth2_provider import views as oauth_views
from rest_framework.routers import SimpleRouter

from . import views

# Mounted at /api/oauth/ — management API (JSON) and the profile resource for apps.
router = SimpleRouter()
router.register("applications", views.ApplicationViewSet, basename="oauth-application")

api_urlpatterns = [
    path("profile/", views.ProfileView.as_view(), name="oauth-profile"),
    path(
        "authorized-apps/",
        views.AuthorizedAppsView.as_view(),
        name="oauth-authorized-apps",
    ),
    path(
        "authorized-apps/<int:pk>/",
        views.AuthorizedAppDetailView.as_view(),
        name="oauth-authorized-app",
    ),
    *router.urls,
]

# Mounted at /o/ — only what this design uses
# (no device flow, no HTML management pages).
provider_urlpatterns = [
    path("authorize/", views.AuthorizationView.as_view(), name="authorize"),
    path("token/", oauth_views.TokenView.as_view(), name="token"),
    path("revoke_token/", oauth_views.RevokeTokenView.as_view(), name="revoke-token"),
]
if settings.OAUTH2_PROVIDER.get("OIDC_ENABLED"):
    provider_urlpatterns += [
        path(
            ".well-known/openid-configuration",
            oauth_views.ConnectDiscoveryInfoView.as_view(),
            name="oidc-connect-discovery-info",
        ),
        path(
            ".well-known/jwks.json",
            oauth_views.JwksInfoView.as_view(),
            name="jwks-info",
        ),
        path("userinfo/", oauth_views.UserInfoView.as_view(), name="user-info"),
    ]
