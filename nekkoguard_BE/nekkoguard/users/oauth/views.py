"""
Connected applications — NekkoGuard as an OAuth2 / OpenID Connect provider.

- AuthorizationView: the consent page. Signed-out users go to the React login first.
- ProfileView: what an approved app can read (scope "profile", read-only).
- AuthorizedAppsView: a user's approved apps; revoke = delete all their tokens/grants.
- ApplicationViewSet: staff register/list/delete apps (client secret shown once).
"""

from __future__ import annotations

from collections import defaultdict
from typing import TYPE_CHECKING

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.shortcuts import redirect
from django.shortcuts import render
from django.utils import timezone
from oauth2_provider import views as oauth_views
from oauth2_provider.contrib.rest_framework import OAuth2Authentication
from oauth2_provider.contrib.rest_framework import TokenHasScope
from oauth2_provider.models import get_access_token_model
from oauth2_provider.models import get_application_model
from oauth2_provider.models import get_grant_model
from oauth2_provider.models import get_refresh_token_model
from rest_framework import mixins
from rest_framework import status
from rest_framework import viewsets
from rest_framework.permissions import IsAdminUser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from nekkoguard.organizations import access
from nekkoguard.users.frontend import frontend_url

from .serializers import ApplicationCreateSerializer
from .serializers import ApplicationSerializer

if TYPE_CHECKING:
    from django.http import HttpRequest
    from django.http import HttpResponse

Application = get_application_model()
AccessToken = get_access_token_model()
RefreshToken = get_refresh_token_model()
Grant = get_grant_model()


class AuthorizationView(oauth_views.AuthorizationView):
    """Consent page; the user signs in through the React frontend first (with 2FA)."""

    def _pkce_method_allowed(self) -> bool:
        # PKCE is required (settings); only the hashed S256 method, never "plain".
        data = self.request.POST if self.request.method == "POST" else self.request.GET
        return data.get("code_challenge_method") == "S256"

    def get(self, request, *args, **kwargs):
        if not self._pkce_method_allowed():
            return self._pkce_error()
        return super().get(request, *args, **kwargs)

    def post(self, request, *args, **kwargs):
        if not self._pkce_method_allowed():
            return self._pkce_error()
        return super().post(request, *args, **kwargs)

    def _pkce_error(self) -> HttpResponse:
        error = {
            "error": "invalid_request",
            "description": "PKCE with code_challenge_method=S256 is required.",
        }
        return render(self.request, self.template_name, {"error": error}, status=400)

    def handle_no_permission(self) -> HttpResponse:
        request: HttpRequest = self.request
        return redirect(
            frontend_url(request, "login", next=request.build_absolute_uri()),
        )


class ProfileView(APIView):
    """`GET /api/oauth/profile/` with a Bearer token (scope "profile")."""

    authentication_classes = [OAuth2Authentication]
    permission_classes = [TokenHasScope]
    required_scopes = ["profile"]

    def get(self, request):
        user = request.user
        return Response({"id": user.pk, "email": user.email, "name": user.name})


class AuthorizedAppsView(APIView):
    """Apps the signed-in user approved (session auth, not OAuth tokens)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        apps: dict[int, dict] = {}
        scopes: dict[int, set[str]] = defaultdict(set)
        # Connected = a still-valid access token or an unrevoked refresh token.
        tokens = AccessToken.objects.filter(
            user=request.user,
            expires__gt=timezone.now(),
        ).select_related(
            "application",
        )
        refresh = RefreshToken.objects.filter(
            user=request.user,
            revoked__isnull=True,
        ).select_related(
            "application",
        )
        for token in [*tokens, *(r for r in refresh)]:
            app = token.application
            if app is None:
                continue
            entry = apps.setdefault(
                app.pk,
                {
                    "id": app.pk,
                    "name": app.name,
                    "authorized_at": token.created,
                    "last_used": token.updated,
                },
            )
            entry["authorized_at"] = min(entry["authorized_at"], token.created)
            entry["last_used"] = max(entry["last_used"], token.updated)
            if isinstance(token, AccessToken):
                scopes[app.pk].update(token.scope.split())
        result = [{**entry, "scopes": sorted(scopes[pk])} for pk, entry in apps.items()]
        result.sort(key=lambda item: item["name"].lower())
        return Response(result)


class AuthorizedAppDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def delete(self, request, pk: int):
        app = get_object_or_404(Application, pk=pk)
        for refresh in RefreshToken.objects.filter(user=request.user, application=app):
            refresh.revoke()  # also revokes its access token
        AccessToken.objects.filter(user=request.user, application=app).delete()
        Grant.objects.filter(user=request.user, application=app).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ApplicationViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """Staff only: register, list and delete applications."""

    permission_classes = [IsAdminUser]
    queryset = Application.objects.order_by("name")

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        # Platform-level privilege: an MFA-verified session (never a token).
        access.ensure_request_mfa(request)

    def get_serializer_class(self):
        return (
            ApplicationCreateSerializer
            if self.action == "create"
            else ApplicationSerializer
        )
