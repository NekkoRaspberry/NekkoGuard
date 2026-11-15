"""
"View as user" for superusers (read-only impersonation).

A superuser picks an active user; from then on every ``/api/`` request of that
browser session is resolved as that user, so tenants, organizations, permissions
and appearance are exactly what the user sees — computed by the normal access
rules. Safeguards:

- Only ``is_superuser`` may start it, re-checked on every request: if the real
  account loses superuser status (or the target is deactivated) it ends at once.
- Read-only: while viewing as someone, any non-safe ``/api/`` request (POST, PUT,
  PATCH, DELETE) is refused with 403 — nothing can be done in their name.
- Only ``/api/`` is affected. Sign-in, password, email, 2FA and sessions
  (``/_allauth/``), Django admin and the OAuth provider always act as the real
  account; so do the ``/api/impersonation/`` endpoints themselves.
- Lives in the server-side session only (sign-out ends it) and every start/stop
  is recorded in ``ImpersonationEvent`` with both identities.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING
from typing import Any

from django.db.models import Q
from django.http import JsonResponse
from django.utils.translation import gettext as _
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import SAFE_METHODS
from rest_framework.permissions import BasePermission
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import ImpersonationEvent
from .models import User

if TYPE_CHECKING:
    from collections.abc import Callable

    from django.http import HttpRequest
    from django.http import HttpResponse
    from rest_framework.request import Request

logger = logging.getLogger(__name__)

SESSION_KEY = "nekkoguard_view_as_user_id"
API_PREFIX = "/api/"
CONTROL_PREFIX = "/api/impersonation/"
SEARCH_LIMIT = 20


def may_impersonate(user: Any) -> bool:
    return bool(
        user is not None
        and user.is_authenticated
        and user.is_active
        and user.is_superuser,
    )


def real_user(request: HttpRequest | Request) -> Any:
    """The account actually signed in (differs from ``request.user`` while viewing)."""
    return getattr(request, "real_user", None) or request.user


def _summary(user: User) -> dict[str, Any]:
    return {"id": user.pk, "email": user.email, "name": user.name}


def _record(actor: User, target: User, action: str) -> None:
    ImpersonationEvent.objects.create(
        actor=actor,
        actor_email=actor.email,
        target=target,
        target_email=target.email,
        action=action,
    )
    logger.warning("Superuser %s %s viewing as %s", actor.email, action, target.email)


class ImpersonationMiddleware:
    """Must come after AuthenticationMiddleware (needs the session and the user)."""

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]):
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        session = getattr(request, "session", None)
        target_id = session.get(SESSION_KEY) if session is not None else None
        if (
            target_id is not None
            and request.path.startswith(API_PREFIX)
            and not request.path.startswith(CONTROL_PREFIX)
        ):
            actor = request.user
            target = User.objects.filter(pk=target_id, is_active=True).first()
            if not may_impersonate(actor) or target is None:
                session.pop(SESSION_KEY, None)  # no longer allowed: back to normal
            else:
                if request.method not in SAFE_METHODS:
                    return JsonResponse(
                        {
                            "detail": _(
                                "You are viewing NekkoGuard as another user: "
                                "changes are disabled. Switch back to your own "
                                "account to make changes.",
                            ),
                        },
                        status=403,
                    )
                request.real_user = actor  # type: ignore[attr-defined]
                request.user = target
                request._cached_user = target  # noqa: SLF001
        return self.get_response(request)


# ---------------------------------------------------------------- API


class IsSuperuser(BasePermission):
    message = "Only superusers can view the app as another user."

    def has_permission(self, request: Request, view: Any) -> bool:
        return may_impersonate(request.user)


class _StartSerializer(serializers.Serializer):
    user = serializers.IntegerField()


class ImpersonationView(APIView):
    """
    GET    /api/impersonation/   status (any signed-in user; reveals nothing to others)
    POST   /api/impersonation/   {"user": id} start viewing as that user (superusers)
    DELETE /api/impersonation/   back to your own account
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request: Request) -> Response:
        if not may_impersonate(request.user):
            return Response({"available": False, "active": False, "user": None})
        target = self._current_target(request)
        return Response(
            {
                "available": True,
                "active": target is not None,
                "user": _summary(target) if target else None,
                "real_user": _summary(request.user),
            },
        )

    @extend_schema(request=_StartSerializer, responses=OpenApiTypes.OBJECT)
    def post(self, request: Request) -> Response:
        self._ensure_superuser(request)
        serializer = _StartSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        target = User.objects.filter(
            pk=serializer.validated_data["user"],
            is_active=True,
        ).first()
        if target is None:
            raise ValidationError({"user": [_("Unknown or inactive user.")]})
        if target.pk == request.user.pk:
            raise ValidationError({"user": [_("That is your own account.")]})
        previous = self._current_target(request)
        if previous is not None:
            _record(request.user, previous, ImpersonationEvent.Action.STOP)
        request.session[SESSION_KEY] = target.pk
        _record(request.user, target, ImpersonationEvent.Action.START)
        return Response({"active": True, "user": _summary(target)})

    @extend_schema(request=None, responses=OpenApiTypes.OBJECT)
    def delete(self, request: Request) -> Response:
        target = self._current_target(request)
        request.session.pop(SESSION_KEY, None)
        if target is not None and may_impersonate(request.user):
            _record(request.user, target, ImpersonationEvent.Action.STOP)
        return Response({"active": False, "user": None})

    @staticmethod
    def _ensure_superuser(request: Request) -> None:
        if not may_impersonate(request.user):
            raise PermissionDenied(IsSuperuser.message)

    @staticmethod
    def _current_target(request: Request) -> User | None:
        target_id = request.session.get(SESSION_KEY)
        if target_id is None:
            return None
        return User.objects.filter(pk=target_id, is_active=True).first()


class ImpersonationUsersView(APIView):
    """GET /api/impersonation/users/?search= — active users to view as (superusers)."""

    permission_classes = [IsAuthenticated, IsSuperuser]

    @extend_schema(
        parameters=[OpenApiParameter("search", str)],
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request: Request) -> Response:
        users = User.objects.filter(is_active=True).exclude(pk=request.user.pk)
        if search := request.query_params.get("search", "").strip():
            users = users.filter(Q(email__icontains=search) | Q(name__icontains=search))
        users = users.order_by("email")[:SEARCH_LIMIT]
        return Response([_summary(u) for u in users])
