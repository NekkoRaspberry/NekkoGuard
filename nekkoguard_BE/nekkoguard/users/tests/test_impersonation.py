"""Superuser "view as user": read-only, superuser-only, audited, /api/ only."""

from __future__ import annotations

import pytest
from django.test import Client
from rest_framework import status

from nekkoguard.organizations.tests.conftest import build_world
from nekkoguard.users.impersonation import SESSION_KEY
from nekkoguard.users.models import ImpersonationEvent
from nekkoguard.users.tests.factories import UserFactory

pytestmark = pytest.mark.django_db

URL = "/api/impersonation/"


@pytest.fixture
def world():
    return build_world()


@pytest.fixture
def superuser():
    return UserFactory(is_superuser=True, is_staff=True, email="root@example.test")


def session_client(user) -> Client:
    """Real session (the feature lives in the session, not in force_authenticate)."""
    client = Client()
    client.force_login(user)
    return client


def tenants_of(client: Client) -> set[str]:
    return {t["name"] for t in client.get("/api/tenants/").json()}


class TestStart:
    def test_superuser_sees_the_app_exactly_as_the_user(self, world, superuser):
        client = session_client(superuser)
        assert tenants_of(client) == {"Tenant A", "Tenant B"}  # a superuser's own view
        response = client.post(
            URL,
            {"user": world.b_admin.pk},
            content_type="application/json",
        )
        assert response.status_code == status.HTTP_200_OK, response.content
        assert client.get("/api/users/me/").json()["email"] == "b_admin@example.test"
        assert tenants_of(client) == {"Tenant B"}
        # Access rules are the user's own: Tenant A stays invisible.
        tenant_a = f"/api/tenants/{world.tenant_a.pk}/"
        assert client.get(tenant_a).status_code == status.HTTP_404_NOT_FOUND

    def test_status_reports_both_identities(self, world, superuser):
        client = session_client(superuser)
        client.post(URL, {"user": world.mary.pk}, content_type="application/json")
        data = client.get(URL).json()
        assert data["available"] is True
        assert data["active"] is True
        assert data["user"]["email"] == "mary@example.test"
        assert data["real_user"]["email"] == "root@example.test"

    def test_switching_directly_to_another_user(self, world, superuser):
        client = session_client(superuser)
        client.post(URL, {"user": world.mary.pk}, content_type="application/json")
        client.post(URL, {"user": world.b_admin.pk}, content_type="application/json")
        assert tenants_of(client) == {"Tenant B"}
        actions = list(
            ImpersonationEvent.objects.order_by("created_at").values_list(
                "action",
                "target_email",
            ),
        )
        assert actions == [
            ("start", "mary@example.test"),
            ("stop", "mary@example.test"),
            ("start", "b_admin@example.test"),
        ]

    @pytest.mark.parametrize("flags", [{}, {"is_staff": True}])
    def test_only_superusers(self, world, flags):
        user = UserFactory(**flags)
        client = session_client(user)
        assert client.get(URL).json() == {
            "available": False,
            "active": False,
            "user": None,
        }
        response = client.post(
            URL,
            {"user": world.mary.pk},
            content_type="application/json",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
        users = client.get(f"{URL}users/")
        assert users.status_code == status.HTTP_403_FORBIDDEN
        assert not ImpersonationEvent.objects.exists()

    def test_inactive_or_own_account_is_refused(self, world, superuser):
        client = session_client(superuser)
        world.mary.is_active = False
        world.mary.save()
        for target in (world.mary, superuser):
            response = client.post(
                URL,
                {"user": target.pk},
                content_type="application/json",
            )
            assert response.status_code == status.HTTP_400_BAD_REQUEST


class TestReadOnly:
    def test_every_change_is_refused_while_viewing(self, world, superuser):
        client = session_client(superuser)
        client.post(URL, {"user": world.ada.pk}, content_type="application/json")
        sites = f"/api/tenants/{world.tenant_a.pk}/organizations/{world.a1.pk}/sites/"
        assert client.get(sites).status_code == status.HTTP_200_OK
        for method in ("post", "put", "patch", "delete"):
            response = getattr(client, method)(
                sites,
                {},
                content_type="application/json",
            )
            assert response.status_code == status.HTTP_403_FORBIDDEN, method
        assert "changes are disabled" in response.json()["detail"]
        assert world.a1.sites.count() == 1

    def test_stop_returns_to_the_real_account(self, world, superuser):
        client = session_client(superuser)
        own_view = tenants_of(client)
        client.post(URL, {"user": world.b_admin.pk}, content_type="application/json")
        assert client.delete(URL).status_code == status.HTTP_200_OK
        assert client.get("/api/users/me/").json()["email"] == "root@example.test"
        assert tenants_of(client) == own_view
        assert ImpersonationEvent.objects.filter(action="stop").count() == 1


class TestSafeguards:
    def test_losing_superuser_status_ends_it(self, world, superuser):
        client = session_client(superuser)
        client.post(URL, {"user": world.b_admin.pk}, content_type="application/json")
        superuser.is_superuser = False
        superuser.save()
        assert client.get("/api/users/me/").json()["email"] == "root@example.test"
        assert SESSION_KEY not in client.session

    def test_deactivated_target_ends_it(self, world, superuser):
        client = session_client(superuser)
        client.post(URL, {"user": world.b_admin.pk}, content_type="application/json")
        world.b_admin.is_active = False
        world.b_admin.save()
        assert client.get("/api/users/me/").json()["email"] == "root@example.test"

    def test_account_endpoints_always_act_as_the_real_user(self, world, superuser):
        client = session_client(superuser)
        client.post(URL, {"user": world.b_admin.pk}, content_type="application/json")
        session = client.get("/_allauth/browser/v1/auth/session")
        assert session.json()["data"]["user"]["email"] == "root@example.test"

    def test_user_search(self, world, superuser):
        client = session_client(superuser)
        found = client.get(f"{URL}users/", {"search": "MARY"}).json()
        assert [u["email"] for u in found] == ["mary@example.test"]
        everyone = {u["email"] for u in client.get(f"{URL}users/").json()}
        assert "root@example.test" not in everyone  # not yourself
