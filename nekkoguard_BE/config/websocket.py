"""
WebSocket endpoint (``/ws/``): the frontend's connection heartbeat (``ping``/``pong!``).

Only signed-in users may connect. The handshake is refused (HTTP 403, before the
socket is accepted) when:

- the ``Origin`` is not this site (or one of ``CSRF_TRUSTED_ORIGINS``): the session
  cookie is sent automatically by browsers, so without this check any web page could
  open a socket as the visitor (cross-site WebSocket hijacking);
- the session cookie does not resolve to an active user. Django's own resolver is
  used, so signed-out, expired, revoked (Profile > Security > Sessions) and
  password-changed sessions are all refused, and a sign-in waiting for its second
  factor is not signed in yet.

Once open, the session is checked again (at most every ``REVALIDATE_SECONDS``) before
answering; when it is no longer valid the socket is closed with code ``4401``.

The socket carries no Tenant or Organization data yet. Anything that will (live
device events, ...) must authorize each subscription server-side with
``nekkoguard.organizations.access`` (``tenant_access_for``: MFA for Tenant
administration — never trust a Tenant/Organization id sent by the client.
"""

from __future__ import annotations

import time
from urllib.parse import urlsplit

from asgiref.sync import sync_to_async
from django.conf import settings
from django.contrib.auth import get_user
from django.http.cookie import parse_cookie
from django.http.request import split_domain_port
from django.http.request import validate_host
from django.utils.module_loading import import_string

#: Close code sent when the session ends while the socket is open (no reason text).
CLOSE_UNAUTHORIZED = 4401
#: Seconds between two session checks of an open socket.
REVALIDATE_SECONDS = 30
PING = "ping"
PONG = "pong!"


def _headers(scope) -> dict[str, str]:
    return {
        k.decode("latin-1").lower(): v.decode("latin-1")
        for k, v in scope.get("headers", [])
    }


def origin_allowed(headers: dict[str, str]) -> bool:
    """The page opening the socket is this site (same host) or a trusted origin."""
    host = headers.get("host", "")
    domain, _port = split_domain_port(host)
    if not domain or not validate_host(domain, settings.ALLOWED_HOSTS):
        return False
    origin = headers.get("origin")
    if not origin:
        return False
    if origin in settings.CSRF_TRUSTED_ORIGINS:
        return True
    parts = urlsplit(origin)
    return parts.scheme in {"http", "https"} and parts.netloc == host


class _SessionRequest:
    """The two attributes ``django.contrib.auth.get_user`` reads."""

    def __init__(self, session_key: str | None):
        engine = import_string(f"{settings.SESSION_ENGINE}.SessionStore")
        self.session = engine(session_key)


@sync_to_async
def session_user(session_key: str | None):
    """The active user of this session, or ``None`` (anonymous, expired, revoked)."""
    if not session_key:
        return None
    user = get_user(_SessionRequest(session_key))
    return user if user.is_authenticated and user.is_active else None


async def websocket_application(scope, receive, send):
    headers = _headers(scope)
    session_key = parse_cookie(headers.get("cookie", "")).get(
        settings.SESSION_COOKIE_NAME,
    )
    user = None
    checked_at = 0.0

    while True:
        event = await receive()

        if event["type"] == "websocket.connect":
            if origin_allowed(headers):
                user = await session_user(session_key)
            if user is None:
                # Closing before accepting makes the server answer the handshake 403.
                await send({"type": "websocket.close"})
                return
            checked_at = time.monotonic()
            await send({"type": "websocket.accept"})

        elif event["type"] == "websocket.disconnect":
            return

        elif event["type"] == "websocket.receive":
            if time.monotonic() - checked_at >= REVALIDATE_SECONDS:
                current = await session_user(session_key)
                if current is None or current.pk != user.pk:
                    await send({"type": "websocket.close", "code": CLOSE_UNAUTHORIZED})
                    return
                checked_at = time.monotonic()
            if event.get("text") == PING:
                await send({"type": "websocket.send", "text": PONG})
