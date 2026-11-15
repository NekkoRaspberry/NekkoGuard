"""Session "last active": off by default, throttled when on (no write per request)."""

from datetime import timedelta

import pytest
from allauth.usersessions.models import UserSession
from django.db import connection
from django.test import Client
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from nekkoguard.conftest import TEST_PASSWORD
from nekkoguard.conftest import verified_user

pytestmark = pytest.mark.django_db

AUTH = "/_allauth/browser/v1"
ME = "/api/users/me/"


def signed_in():
    user = verified_user()
    client = Client()
    response = client.post(
        f"{AUTH}/auth/login",
        {"email": user.email, "password": TEST_PASSWORD},
        content_type="application/json",
    )
    assert response.status_code == 200  # noqa: PLR2004
    return client, UserSession.objects.get(user=user)


def session_writes(client, path=ME, times=1) -> int:
    with CaptureQueriesContext(connection) as queries:
        for _ in range(times):
            client.get(path)
    return sum(
        1
        for q in queries.captured_queries
        if q["sql"].startswith("UPDATE") and "usersessions_usersession" in q["sql"]
    )


def worker(client):
    """Same browser session, served by another process (its own middleware memory)."""
    other = Client()
    other.cookies = client.cookies
    return other


def age(session, minutes):
    UserSession.objects.filter(pk=session.pk).update(
        last_seen_at=timezone.now() - timedelta(minutes=minutes),
    )


def test_sign_in_time_is_recorded():
    before = timezone.now()
    _, session = signed_in()
    assert session.created_at >= before - timedelta(seconds=1)


def test_tracking_is_off_by_default_no_writes_and_no_last_active(settings):
    assert settings.USERSESSIONS_TRACK_ACTIVITY is False
    client, session = signed_in()
    age(session, 60)
    assert session_writes(client, times=5) == 0
    data = client.get(f"{AUTH}/auth/sessions").json()["data"][0]
    assert "last_seen_at" not in data  # the list shows the sign-in time instead
    assert "created_at" in data


def test_tracking_on_writes_once_per_interval(settings):
    settings.USERSESSIONS_TRACK_ACTIVITY = True
    settings.USERSESSIONS_ACTIVITY_INTERVAL = 600
    client, session = signed_in()
    age(session, 60)  # last seen an hour ago
    client = worker(client)
    assert session_writes(client) == 1
    session.refresh_from_db()
    assert timezone.now() - session.last_seen_at < timedelta(seconds=5)
    # Repeated requests inside the interval: no database work at all.
    assert session_writes(client, times=10) == 0
    data = client.get(f"{AUTH}/auth/sessions").json()["data"][0]
    assert "last_seen_at" in data


def test_another_worker_does_not_write_again_inside_the_interval(settings):
    """A second process (fresh memory) only issues a conditional UPDATE that changes
    nothing while the stored time is recent."""
    settings.USERSESSIONS_TRACK_ACTIVITY = True
    settings.USERSESSIONS_ACTIVITY_INTERVAL = 600
    client, session = signed_in()
    age(session, 60)
    assert session_writes(worker(client)) == 1
    session.refresh_from_db()
    first = session.last_seen_at

    worker(client).get(ME)
    session.refresh_from_db()
    assert session.last_seen_at == first


def test_after_the_interval_it_is_written_again(settings):
    settings.USERSESSIONS_TRACK_ACTIVITY = True
    settings.USERSESSIONS_ACTIVITY_INTERVAL = 0
    client, session = signed_in()
    age(session, 5)
    assert session_writes(worker(client)) == 1


def test_anonymous_requests_never_write(settings):
    settings.USERSESSIONS_TRACK_ACTIVITY = True
    assert session_writes(Client(), times=3) == 0
