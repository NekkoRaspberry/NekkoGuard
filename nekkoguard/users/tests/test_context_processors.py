from __future__ import annotations

import pytest
from django.test import RequestFactory

from nekkoguard.users.context_processors import frontend_url


@pytest.mark.parametrize(
    ("host", "expected"),
    [
        ("nekkoguard.home.arpa:8000", "http://nekkoguard.home.arpa:8080/"),
        ("localhost:8000", "http://localhost:8080/"),
        ("localhost", "http://localhost:8080/"),
        ("[::1]:8000", "http://[::1]:8080/"),
    ],
)
def test_frontend_url_follows_request_host(settings, host: str, expected: str):
    settings.FRONTEND_URL = ""
    settings.FRONTEND_PORT = 8080
    settings.ALLOWED_HOSTS = ["*"]
    request = RequestFactory().get("/", HTTP_HOST=host)

    assert frontend_url(request) == {"FRONTEND_URL": expected}


def test_frontend_url_setting_wins(settings):
    # Production: frontend and backend share the domain.
    settings.FRONTEND_URL = "/"
    request = RequestFactory().get("/", HTTP_HOST="nekkoguard.com")

    assert frontend_url(request) == {"FRONTEND_URL": "/"}
