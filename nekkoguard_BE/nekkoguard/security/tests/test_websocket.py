# ruff: noqa: PLR2004 - HTTP status codes
"""/ws/ accepts only signed-in users from this site; drops sessions that end (#9)."""

import pytest
from allauth.usersessions.models import UserSession
from asgiref.sync import async_to_sync
from asgiref.sync import sync_to_async
from asgiref.testing import ApplicationCommunicator
from django.conf import settings
from django.test import Client

from config import websocket
from nekkoguard.conftest import TEST_PASSWORD
from nekkoguard.conftest import enable_totp
from nekkoguard.conftest import verified_user
from nekkoguard.users.tests.factories import UserFactory

pytestmark = pytest.mark.django_db

HOST = "testserver"
ORIGIN = f"http://{HOST}"


def scope(session_key=None, *, origin=ORIGIN, host=HOST):
    headers = [(b"host", host.encode())]
    if origin is not None:
        headers.append((b"origin", origin.encode()))
    if session_key is not None:
        headers.append(
            (b"cookie", f"{settings.SESSION_COOKIE_NAME}={session_key}".encode()),
        )
    return {"type": "websocket", "path": "/ws/", "headers": headers}


def handshake(scope_):
    """Connect, send a ping; return the events the server sent (in order)."""

    async def run():
        app = ApplicationCommunicator(websocket.websocket_application, scope_)
        await app.send_input({"type": "websocket.connect"})
        first = await app.receive_output(timeout=5)
        events = [first]
        if first["type"] == "websocket.accept":
            await app.send_input({"type": "websocket.receive", "text": "ping"})
            events.append(await app.receive_output(timeout=5))
            await app.send_input({"type": "websocket.disconnect", "code": 1000})
        await app.wait(timeout=5)
        return events

    return async_to_sync(run)()


def signed_in(user=None):
    user = user or UserFactory()
    client = Client()
    client.force_login(user)
    return user, client, client.session.session_key


def assert_refused(events):
    # Closed before being accepted: the server answers the handshake with 403.
    assert events == [{"type": "websocket.close"}]


def assert_open(events):
    assert events == [
        {"type": "websocket.accept"},
        {"type": "websocket.send", "text": "pong!"},
    ]


def test_signed_in_user_connects_and_gets_pong():
    _, _, key = signed_in()
    assert_open(handshake(scope(key)))


@pytest.mark.parametrize("key", [None, "", "not-a-session", "x" * 32])
def test_without_a_valid_session_the_handshake_is_refused(key):
    assert_refused(handshake(scope(key)))


@pytest.mark.parametrize(
    ("origin", "host"),
    [
        (None, HOST),  # no Origin: not a browser page of this site
        ("https://evil.example", HOST),  # cross-site WebSocket hijacking
        (f"http://{HOST}.evil.example", HOST),
        ("null", HOST),
        (ORIGIN, "evil.example"),  # Host outside ALLOWED_HOSTS
    ],
)
def test_foreign_origin_or_host_is_refused_even_with_a_session(origin, host):
    _, _, key = signed_in()
    assert_refused(handshake(scope(key, origin=origin, host=host)))


def test_trusted_origin_is_accepted(settings):
    settings.CSRF_TRUSTED_ORIGINS = ["https://app.example.com"]
    _, _, key = signed_in()
    assert_open(handshake(scope(key, origin="https://app.example.com")))


def test_signed_out_session_is_refused():
    _, client, key = signed_in()
    client.logout()
    assert_refused(handshake(scope(key)))


def test_session_revoked_from_the_sessions_list_is_refused():
    user = verified_user()
    # A real sign-in records the session (allauth usersessions).
    client = Client()
    response = client.post(
        "/_allauth/browser/v1/auth/login",
        {"email": user.email, "password": TEST_PASSWORD},
        content_type="application/json",
    )
    assert response.status_code == 200, response.content
    key = client.session.session_key
    assert_open(handshake(scope(key)))
    UserSession.objects.get(session_key=key).end()
    assert_refused(handshake(scope(key)))


def test_session_is_refused_after_a_password_change():
    user, _, key = signed_in()
    user.set_password("another-Long-pass-456")
    user.save()
    assert_refused(handshake(scope(key)))


def test_deactivated_user_is_refused():
    user, _, key = signed_in()
    user.is_active = False
    user.save()
    assert_refused(handshake(scope(key)))


def test_sign_in_waiting_for_the_second_factor_is_not_signed_in():
    user = verified_user()
    enable_totp(user)
    client = Client()
    response = client.post(
        "/_allauth/browser/v1/auth/login",
        {"email": user.email, "password": TEST_PASSWORD},
        content_type="application/json",
    )
    assert response.status_code == 401
    assert response.json()["data"]["flows"][-1]["id"] == "mfa_authenticate"
    assert_refused(handshake(scope(client.session.session_key)))


def test_open_socket_is_closed_when_the_session_ends(monkeypatch):
    _, client, key = signed_in()
    monkeypatch.setattr(websocket, "REVALIDATE_SECONDS", 0)

    async def run():
        app = ApplicationCommunicator(websocket.websocket_application, scope(key))
        await app.send_input({"type": "websocket.connect"})
        assert (await app.receive_output(timeout=5))["type"] == "websocket.accept"
        await app.send_input({"type": "websocket.receive", "text": "ping"})
        assert (await app.receive_output(timeout=5))["text"] == "pong!"
        await sync_logout()
        await app.send_input({"type": "websocket.receive", "text": "ping"})
        closed = await app.receive_output(timeout=5)
        await app.wait(timeout=5)
        return closed

    sync_logout = sync_to_async(client.logout)
    assert async_to_sync(run)() == {
        "type": "websocket.close",
        "code": websocket.CLOSE_UNAUTHORIZED,
    }


def test_unknown_messages_get_no_answer():
    _, _, key = signed_in()

    async def run():
        app = ApplicationCommunicator(websocket.websocket_application, scope(key))
        await app.send_input({"type": "websocket.connect"})
        await app.receive_output(timeout=5)
        await app.send_input(
            {"type": "websocket.receive", "text": '{"subscribe": "tenant:1"}'},
        )
        assert await app.receive_nothing(timeout=0.2)
        await app.send_input({"type": "websocket.disconnect", "code": 1000})
        await app.wait(timeout=5)

    async_to_sync(run)()
