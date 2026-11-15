"""
"Last active" for the active sessions list, cheap enough for a Raspberry Pi.

Off by default (``DJANGO_USERSESSIONS_TRACK_ACTIVITY``): the list then shows when each
session signed in, which allauth records at sign-in anyway.

When on, this replaces allauth's own middleware (which writes on *every* request):

- at most one write per session every ``USERSESSIONS_ACTIVITY_INTERVAL`` seconds
  (default 10 minutes);
- a per-process memory of the last write skips the database entirely in between
  (no read, no Redis, no session save);
- the write itself is one conditional ``UPDATE … WHERE last_seen_at < cutoff``, so
  several worker processes never write more than once per interval either.
"""

from __future__ import annotations

import time
from datetime import timedelta
from typing import TYPE_CHECKING

from django.conf import settings
from django.contrib.auth import SESSION_KEY
from django.utils import timezone

if TYPE_CHECKING:
    from collections.abc import Callable

    from django.http import HttpRequest
    from django.http import HttpResponse

#: Bound on the per-process memory (cleared when full: worst case one extra UPDATE).
MAX_REMEMBERED = 10_000


class SessionActivityMiddleware:
    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]):
        self.get_response = get_response
        self._written: dict[str, float] = {}

    def __call__(self, request: HttpRequest) -> HttpResponse:
        response = self.get_response(request)
        if settings.USERSESSIONS_TRACK_ACTIVITY:
            self.touch(request)
        return response

    def touch(self, request: HttpRequest) -> None:
        session = getattr(request, "session", None)
        key = session.session_key if session is not None else None
        if not key or SESSION_KEY not in session:
            return  # anonymous or signed out during this request
        interval = settings.USERSESSIONS_ACTIVITY_INTERVAL
        now = time.monotonic()
        last = self._written.get(key)
        if last is not None and now - last < interval:
            return
        if len(self._written) >= MAX_REMEMBERED:
            self._written.clear()
        self._written[key] = now

        from allauth.usersessions.models import UserSession  # noqa: PLC0415

        seen = timezone.now()
        UserSession.objects.filter(
            session_key=key,
            last_seen_at__lt=seen - timedelta(seconds=interval),
        ).update(last_seen_at=seen)
