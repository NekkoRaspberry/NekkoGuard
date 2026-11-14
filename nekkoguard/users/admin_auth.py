"""
Two-factor authentication for the Django admin.

The admin has no login form of its own any more:
- Signing in happens in the React frontend (allauth headless: password + 2FA code),
  which then sends the user back to the admin.
- The admin opens only for active staff users who have 2FA enabled AND completed
  the 2FA step in the current session. A password-only session is refused.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from allauth.account.internal.flows.login import get_authentication_records
from allauth.mfa.utils import is_mfa_enabled
from django.contrib import admin
from django.contrib.admin import AdminSite
from django.contrib.auth import logout
from django.shortcuts import redirect
from django.shortcuts import render
from django.urls import reverse
from django.utils.http import url_has_allowed_host_and_scheme
from django.views.decorators.http import require_POST

from .frontend import frontend_base_url
from .frontend import frontend_url

if TYPE_CHECKING:
    from django.http import HttpRequest
    from django.http import HttpResponse

def session_passed_mfa(request: HttpRequest) -> bool:
    """True when this session completed a 2FA step (allauth records it as "mfa")."""
    records = get_authentication_records(request, request.user)
    return any(record.get("method") == "mfa" for record in records)


def admin_has_permission(request: HttpRequest) -> bool:
    return (
        # Django's own check (active + staff), called on the class so it is never
        # our patched version.
        AdminSite.has_permission(admin.site, request)
        and is_mfa_enabled(request.user)
        and session_passed_mfa(request)
    )


def _frontend_login_redirect(request: HttpRequest, next_path: str) -> HttpResponse:
    return redirect(
        frontend_url(request, "login", next=request.build_absolute_uri(next_path)),
    )


def admin_login(request: HttpRequest, extra_context=None) -> HttpResponse:
    """Replaces the admin's password form; see the module docstring."""
    next_path = request.GET.get("next") or reverse("admin:index")
    allowed = {request.get_host()}
    if not url_has_allowed_host_and_scheme(next_path, allowed_hosts=allowed):
        next_path = reverse("admin:index")

    user = request.user
    if not user.is_authenticated:
        return _frontend_login_redirect(request, next_path)
    if admin_has_permission(request):
        return redirect(next_path)

    if not (user.is_active and user.is_staff):
        reason = "not_staff"
    elif not is_mfa_enabled(user):
        reason = "mfa_not_enabled"
    else:
        reason = "mfa_not_verified"
    context = {
        "reason": reason,
        "security_url": frontend_url(request, "account/security") + "#two-factor",
        "frontend_home": frontend_base_url(request),
    }
    return render(request, "admin/mfa_required.html", context, status=403)


@require_POST
def admin_signout(request: HttpRequest) -> HttpResponse:
    """Sign out (any user) and start a fresh frontend sign-in for the admin."""
    logout(request)
    return _frontend_login_redirect(request, reverse("admin:index"))


def install() -> None:
    """Wire the checks into the default admin site (called from users/admin.py)."""
    admin.site.has_permission = admin_has_permission  # type: ignore[method-assign]
    admin.site.login = admin_login  # type: ignore[method-assign]
    admin.site.site_header = "NekkoGuard Administration"
    admin.site.site_title = "NekkoGuard Administration"
