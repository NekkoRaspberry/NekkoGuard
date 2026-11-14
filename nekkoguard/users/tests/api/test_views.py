from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from rest_framework.test import APIClient
from rest_framework.test import APIRequestFactory

from nekkoguard.users.api.views import UserViewSet

if TYPE_CHECKING:
    from nekkoguard.users.models import User


class TestUserViewSet:
    @pytest.fixture
    def api_rf(self) -> APIRequestFactory:
        return APIRequestFactory()

    def test_get_queryset(self, user: User, api_rf: APIRequestFactory):
        view = UserViewSet()
        request = api_rf.get("/fake-url/")
        request.user = user

        view.request = request  # type: ignore[assignment]

        assert user in view.get_queryset()

    def test_me(self, user: User, api_rf: APIRequestFactory):
        view = UserViewSet()
        request = api_rf.get("/fake-url/")
        request.user = user

        view.request = request  # type: ignore[assignment]

        response = view.me(request)

        assert response.data == {
            "id": user.pk,
            "email": user.email,
            "name": user.name,
            "is_staff": user.is_staff,
            "url": f"http://testserver/api/users/{user.pk}/",
        }


class TestUserApiPermissions:
    def test_only_name_is_writable(self, user: User):
        client = APIClient()
        client.force_authenticate(user=user)
        original_email = user.email

        response = client.patch(
            f"/api/users/{user.pk}/",
            {"name": "New Name", "email": "other@example.com", "is_staff": True},
            format="json",
        )

        assert response.status_code == 200  # noqa: PLR2004
        user.refresh_from_db()
        assert user.name == "New Name"
        assert user.email == original_email
        assert user.is_staff is False

    def test_public_token_endpoint_removed(self, user: User):
        # The old endpoint issued tokens with email + password only (no 2FA).
        response = APIClient().post(
            "/api/auth-token/",
            {"username": user.email, "password": "irrelevant"},
            format="json",
        )
        assert response.status_code == 404  # noqa: PLR2004


@pytest.mark.django_db
def test_headless_session_endpoint_is_available():
    response = APIClient().get("/_allauth/browser/v1/auth/session")
    # 401 = not authenticated, with the available flows in the body
    assert response.status_code == 401  # noqa: PLR2004
    flow_ids = {flow["id"] for flow in response.json()["data"]["flows"]}
    assert "login" in flow_ids
