"""Tenant rights apply only inside the member's organization scope."""

from __future__ import annotations

import pytest
from rest_framework import status

from nekkoguard.organizations import access
from nekkoguard.organizations.models import TenantMembership
from nekkoguard.organizations.models import TenantOrganizationAccess
from nekkoguard.organizations.roles import OrganizationAccess
from nekkoguard.organizations.roles import OrganizationRole
from nekkoguard.organizations.roles import TenantRole
from nekkoguard.users.tests.factories import UserFactory

from .conftest import _member
from .conftest import api_client
from .test_api import o_url
from .test_api import t_url

pytestmark = pytest.mark.django_db


def members_url(world):
    return t_url(world.tenant_a, "members/")


class TestOwnersAreLimitedToo:
    def test_scoped_owner_administers_only_selected(self, world):
        owner = UserFactory()
        _member(
            world.tenant_a,
            owner,
            TenantRole.ADMIN,
            access=OrganizationAccess.SELECTED,
            default=OrganizationRole.ADMIN,
            selected=[world.a1],
        )
        client = api_client(owner)
        assert client.get(o_url(world.a1, "members/")).status_code == status.HTTP_200_OK
        assert (
            client.get(o_url(world.a2, "members/")).status_code
            == status.HTTP_404_NOT_FOUND
        )

    def test_superusers_are_not_limited(self, world):
        root = UserFactory(is_superuser=True)
        tenant_access = access.get_tenant_access(root, world.tenant_a)
        assert tenant_access.administers(world.a1)
        assert tenant_access.administers(world.a2)


class TestTenantMembers:
    def test_scoped_admin_sees_members_concerning_their_organizations(
        self,
        world,
        scoped_admin,
    ):
        only_a2 = UserFactory(email="only_a2@example.test")
        _member(
            world.tenant_a,
            only_a2,
            TenantRole.MEMBER,
            access=OrganizationAccess.SELECTED,
            default=OrganizationRole.VIEWER,
            selected=[world.a2],
        )
        data = api_client(scoped_admin).get(members_url(world)).data
        emails = {m["user"]["email"]: m["can_manage"] for m in data}
        assert "only_a2@example.test" not in emails  # concerns A2 only
        assert emails["mary@example.test"] is True  # selected A1: within scope
        assert emails["carl@example.test"] is False  # "All": beyond their scope
        assert emails["ada@example.test"] is False
        assert emails["david@example.test"] is True  # no organizations yet

    def test_full_scope_admin_sees_everyone(self, world):
        data = world.client("john").get(members_url(world)).data
        assert (
            len(data)
            == TenantMembership.objects.filter(
                tenant=world.tenant_a,
            ).count()
        )

    @pytest.mark.parametrize(
        ("organization_access", "selected", "expected"),
        [
            ("all", [], status.HTTP_403_FORBIDDEN),
            ("selected", ["a2"], status.HTTP_403_FORBIDDEN),
            ("selected", ["a1"], status.HTTP_201_CREATED),
            ("none", [], status.HTTP_201_CREATED),
        ],
    )
    def test_grants_only_within_their_scope(
        self,
        world,
        scoped_admin,
        organization_access,
        selected,
        expected,
    ):
        body = {
            "email": UserFactory().email,
            "role": "member",
            "organization_access": organization_access,
            "default_organization_role": ""
            if organization_access == "none"
            else "viewer",
            "selected_organizations": [str(getattr(world, s).pk) for s in selected],
        }
        response = api_client(scoped_admin).post(
            members_url(world),
            body,
            format="json",
        )
        assert response.status_code == expected, response.data

    def test_cannot_change_or_remove_members_beyond_their_scope(
        self,
        world,
        scoped_admin,
    ):
        carl = TenantMembership.objects.get(tenant=world.tenant_a, user=world.carl)
        client = api_client(scoped_admin)
        url = f"{members_url(world)}{carl.pk}/"
        assert (
            client.patch(url, {"role": "member"}, format="json").status_code
            == status.HTTP_403_FORBIDDEN
        )
        assert client.delete(url).status_code == status.HTTP_403_FORBIDDEN

    def test_can_change_members_within_scope_but_not_widen_them(
        self,
        world,
        scoped_admin,
    ):
        mary = TenantMembership.objects.get(tenant=world.tenant_a, user=world.mary)
        url = f"{members_url(world)}{mary.pk}/"
        client = api_client(scoped_admin)
        ok = client.patch(url, {"default_organization_role": "viewer"}, format="json")
        assert ok.status_code == status.HTTP_200_OK
        widen = client.patch(url, {"organization_access": "all"}, format="json")
        assert widen.status_code == status.HTTP_403_FORBIDDEN

    def test_scoped_owner_cannot_widen_their_own_scope(self, world):
        owner = UserFactory()
        membership = _member(
            world.tenant_a,
            owner,
            TenantRole.ADMIN,
            access=OrganizationAccess.SELECTED,
            default=OrganizationRole.ADMIN,
            selected=[world.a1],
        )
        response = api_client(owner).patch(
            f"{members_url(world)}{membership.pk}/",
            {"organization_access": "all"},
            format="json",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN


class TestOrganizations:
    def test_scoped_creator_gets_the_new_organization_in_their_selection(
        self,
        world,
        scoped_admin,
    ):
        response = api_client(scoped_admin).post(
            t_url(world.tenant_a, "organizations/"),
            {"name": "New"},
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert TenantOrganizationAccess.objects.filter(
            membership__user=scoped_admin,
            organization_id=response.data["id"],
        ).exists()

    def test_admin_without_organizations_cannot_create(self, world, no_org_admin):
        response = api_client(no_org_admin).post(
            t_url(world.tenant_a, "organizations/"),
            {"name": "New"},
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN


class TestActivityAndTenant:
    def test_scoped_admin_sees_activity_of_their_organizations_only(
        self,
        world,
        scoped_admin,
    ):
        world.client("ada").post(o_url(world.a1, "sites/"), {"name": "In A1"})
        world.client("ada").post(o_url(world.a2, "sites/"), {"name": "In A2"})
        data = api_client(scoped_admin).get(t_url(world.tenant_a, "activity/")).data
        names = {e["target_name"] for e in data["results"]}
        assert "In A1" in names
        assert "In A2" not in names
        full = world.client("john").get(t_url(world.tenant_a, "activity/")).data
        assert {"In A1", "In A2"} <= {e["target_name"] for e in full["results"]}

    def test_tenant_reports_the_callers_organization_scope(self, world, scoped_admin):
        tenant = next(
            t
            for t in api_client(scoped_admin).get("/api/tenants/").data
            if t["id"] == str(world.tenant_a.pk)
        )
        assert tenant["organization_access"] == "selected"
