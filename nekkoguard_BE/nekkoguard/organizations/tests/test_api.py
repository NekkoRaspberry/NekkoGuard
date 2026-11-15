"""HTTP layer: isolation (404), permissions (403), parent validation, auditing."""

from __future__ import annotations

import uuid

import pytest
from rest_framework import status

from nekkoguard.organizations.models import ActivityEntry
from nekkoguard.organizations.models import OrganizationMembership
from nekkoguard.organizations.models import PermissionOverride
from nekkoguard.organizations.models import Site
from nekkoguard.organizations.models import TenantMembership
from nekkoguard.organizations.roles import Effect
from nekkoguard.organizations.roles import OrganizationAccess
from nekkoguard.organizations.roles import Permission
from nekkoguard.organizations.roles import TenantRole
from nekkoguard.users.tests.factories import UserFactory

from .conftest import api_client
from .factories import OrganizationMembershipFactory

pytestmark = pytest.mark.django_db


def t_url(tenant, suffix=""):
    return f"/api/tenants/{tenant.pk}/{suffix}"


def o_url(org, suffix="", tenant=None):
    tenant = tenant or org.tenant
    return f"/api/tenants/{tenant.pk}/organizations/{org.pk}/{suffix}"


def ids(response):
    return {item["id"] for item in response.data}


# ---------------------------------------------------------------- authentication


def test_anonymous_is_rejected(world):
    client = api_client()
    for url in ["/api/tenants/", t_url(world.tenant_a, "members/"), o_url(world.a1)]:
        assert client.get(url).status_code in {401, 403}


# ---------------------------------------------------------------- tenants


class TestTenants:
    def test_list_shows_visible_tenants_with_my_role(self, world):
        response = world.client("sarah").get("/api/tenants/")
        roles = {item["id"]: item["role"] for item in response.data}
        assert roles == {
            str(world.tenant_a.pk): TenantRole.MEMBER,
            str(world.tenant_b.pk): TenantRole.ADMIN,
        }

    def test_organization_only_user_sees_tenant_without_role(self, world):
        response = world.client("peter").get("/api/tenants/")
        assert len(response.data) == 1
        assert response.data[0]["role"] is None
        assert response.data[0]["permissions"] == []

    def test_outsider_sees_nothing(self, world):
        assert world.client("outsider").get("/api/tenants/").data == []
        response = world.client("outsider").get(f"/api/tenants/{world.tenant_a.pk}/")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_other_tenant_detail_is_not_found(self, world):
        response = world.client("john").get(f"/api/tenants/{world.tenant_b.pk}/")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_only_tenant_managers_edit(self, world):
        url = f"/api/tenants/{world.tenant_a.pk}/"
        response = world.client("carl").patch(url, {"name": "X"})
        assert response.status_code == status.HTTP_403_FORBIDDEN
        response = world.client("john").patch(url, {"name": "Renamed"})
        assert response.status_code == status.HTTP_200_OK
        assert ActivityEntry.objects.filter(action="tenant.updated").exists()


class TestTenantMembers:
    def test_permissions(self, world):
        url = t_url(world.tenant_a, "members/")
        assert world.client("john").get(url).status_code == status.HTTP_200_OK
        assert world.client("carl").get(url).status_code == status.HTTP_403_FORBIDDEN
        assert world.client("peter").get(url).status_code == status.HTTP_404_NOT_FOUND
        assert world.client("b_admin").get(url).status_code == status.HTTP_404_NOT_FOUND

    def test_add_member_with_selected_access(self, world):
        new = UserFactory()
        response = world.client("john").post(
            t_url(world.tenant_a, "members/"),
            {
                "email": new.email,
                "role": "member",
                "organization_access": "selected",
                "default_organization_role": "viewer",
                "selected_organizations": [str(world.a1.pk)],
            },
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED, response.data
        assert response.data["selected_organizations"] == [str(world.a1.pk)]

    def test_selected_organization_from_other_tenant_is_rejected(self, world):
        response = world.client("john").post(
            t_url(world.tenant_a, "members/"),
            {
                "email": UserFactory().email,
                "role": "member",
                "organization_access": "selected",
                "default_organization_role": "viewer",
                "selected_organizations": [str(world.b1.pk)],
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "selected_organizations" in response.data

    def test_member_of_other_tenant_is_not_found(self, world):
        other = TenantMembership.objects.get(user=world.users["b_admin"])
        response = world.client("john").patch(
            t_url(world.tenant_a, f"members/{other.pk}/"),
            {"organization_access": OrganizationAccess.NONE},
            format="json",
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_owner_role_no_longer_exists(self, world):
        carl = TenantMembership.objects.get(
            user=world.users["carl"],
            tenant=world.tenant_a,
        )
        response = world.client("john").patch(
            t_url(world.tenant_a, f"members/{carl.pk}/"),
            {"role": "owner"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "role" in response.json()


# ---------------------------------------------------------------- organizations


class TestOrganizationList:
    def test_tenant_manager_sees_the_organizations_of_their_scope(
        self,
        world,
        scoped_admin,
    ):
        response = world.client("john").get(t_url(world.tenant_a, "organizations/"))
        assert {i["name"]: i["can_administer"] for i in response.data} == {
            "A1": True,
            "A2": True,
        }
        scoped = api_client(scoped_admin).get(t_url(world.tenant_a, "organizations/"))
        assert {i["name"]: i["can_administer"] for i in scoped.data} == {"A1": True}

    def test_reached_but_not_administered_organizations_are_flagged(
        self,
        world,
        scoped_admin,
    ):
        # A direct membership outside the selection: reachable, not administered.
        OrganizationMembershipFactory(organization=world.a2, user=scoped_admin)
        response = api_client(scoped_admin).get(t_url(world.tenant_a, "organizations/"))
        assert {
            i["name"]: (i["has_access"], i["can_administer"]) for i in response.data
        } == {"A1": (True, True), "A2": (True, False)}

    def test_members_see_only_reached_organizations(self, world):
        mary = world.client("mary").get(t_url(world.tenant_a, "organizations/"))
        assert ids(mary) == {str(world.a1.pk)}
        peter = world.client("peter").get(t_url(world.tenant_a, "organizations/"))
        assert ids(peter) == {str(world.a2.pk)}
        david = world.client("david").get(t_url(world.tenant_a, "organizations/"))
        assert david.data == []

    def test_strangers_get_not_found(self, world):
        url = t_url(world.tenant_a, "organizations/")
        assert (
            world.client("outsider").get(url).status_code == status.HTTP_404_NOT_FOUND
        )
        assert world.client("b_admin").get(url).status_code == status.HTTP_404_NOT_FOUND

    def test_create_requires_tenant_permission(self, world):
        url = t_url(world.tenant_a, "organizations/")
        response = world.client("carl").post(url, {"name": "New"})
        assert response.status_code == status.HTTP_403_FORBIDDEN
        response = world.client("john").post(url, {"name": "New", "tenant": "x"})
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["tenant"] == str(world.tenant_a.pk)  # body ignored

    def test_duplicate_name_in_tenant_is_rejected(self, world):
        response = world.client("john").post(
            t_url(world.tenant_a, "organizations/"),
            {"name": "a1"},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


class TestOrganizationDetail:
    def test_includes_my_effective_access(self, world):
        response = world.client("carl").get(o_url(world.a1))
        assert response.status_code == status.HTTP_200_OK
        my_access = response.data["my_access"]
        assert my_access["via_tenant"] is True
        assert my_access["inherited_role"] == "operator"
        assert "networks.view" not in my_access["permissions"]
        decisions = {d["permission"]: d for d in my_access["decisions"]}
        assert decisions["networks.view"]["source"] == "override"
        assert decisions["sites.view"]["source"] == "tenant_role"

    def test_unselected_organization_is_not_visible_to_a_scoped_admin(
        self,
        world,
        scoped_admin,
        no_org_admin,
    ):
        client = api_client(scoped_admin)
        assert client.get(o_url(world.a1)).data["can_administer"] is True
        assert client.get(o_url(world.a2)).status_code == status.HTTP_404_NOT_FOUND
        assert (
            api_client(no_org_admin).get(o_url(world.a1)).status_code
            == status.HTTP_404_NOT_FOUND
        )

    def test_unreached_organization_is_not_found(self, world):
        assert (
            world.client("mary").get(o_url(world.a2)).status_code
            == status.HTTP_404_NOT_FOUND
        )
        assert (
            world.client("outsider").get(o_url(world.a1)).status_code
            == status.HTTP_404_NOT_FOUND
        )

    def test_organization_under_wrong_tenant_is_not_found(self, world):
        url = o_url(world.a1, tenant=world.tenant_b)
        assert world.client("sarah").get(url).status_code == status.HTTP_404_NOT_FOUND
        assert world.client("ada").get(url).status_code == status.HTTP_404_NOT_FOUND

    def test_unknown_or_malformed_ids_are_not_found(self, world):
        client = world.client("ada")
        assert (
            client.get(o_url(world.a1).replace(str(world.a1.pk), "1")).status_code
            == status.HTTP_404_NOT_FOUND
        )
        unknown = f"/api/tenants/{world.tenant_a.pk}/organizations/{uuid.uuid4()}/"
        assert client.get(unknown).status_code == status.HTTP_404_NOT_FOUND

    def test_only_tenant_managers_deactivate(self, world):
        org_admin = UserFactory()
        OrganizationMembership.objects.create(
            organization=world.a2,
            user=org_admin,
            role="admin",
        )
        client = api_client(org_admin)
        assert (
            client.patch(o_url(world.a2), {"name": "A2 renamed"}).status_code
            == status.HTTP_200_OK
        )
        response = client.patch(o_url(world.a2), {"is_active": False}, format="json")
        assert response.status_code == status.HTTP_403_FORBIDDEN
        response = world.client("john").patch(
            o_url(world.a2),
            {"is_active": False},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert ActivityEntry.objects.filter(action="organization.deactivated").exists()
        assert (
            world.client("peter").get(o_url(world.a2)).status_code
            == status.HTTP_404_NOT_FOUND
        )


# ---------------------------------------------------------------- infrastructure


class TestSites:
    def test_list_is_scoped_to_the_organization(self, world):
        response = world.client("mary").get(o_url(world.a1, "sites/"))
        assert ids(response) == {str(world.sites["A1"].pk)}

    def test_scoped_admin_reaches_only_selected_infrastructure(
        self,
        world,
        scoped_admin,
    ):
        client = api_client(scoped_admin)
        assert client.get(o_url(world.a1, "sites/")).status_code == status.HTTP_200_OK
        response = client.get(o_url(world.a2, "sites/"))
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_strangers_get_not_found(self, world):
        for name in ["outsider", "david", "b_admin", "peter"]:
            response = world.client(name).get(o_url(world.a1, "sites/"))
            assert response.status_code == status.HTTP_404_NOT_FOUND, name

    def test_viewers_cannot_write(self, world):
        response = world.client("mary").post(o_url(world.a1, "sites/"), {"name": "X"})
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_create_is_audited_and_uses_url_organization(self, world):
        response = world.client("ada").post(
            o_url(world.a1, "sites/"),
            {"name": "Branch", "organization": str(world.a2.pk)},
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert Site.objects.get(pk=response.data["id"]).organization == world.a1
        entry = ActivityEntry.objects.get(action="site.created")
        assert entry.organization == world.a1
        assert entry.tenant == world.tenant_a

    def test_site_of_another_organization_is_not_found(self, world):
        site_a2 = world.sites["A2"]
        response = world.client("ada").get(o_url(world.a1, f"sites/{site_a2.pk}/"))
        assert response.status_code == status.HTTP_404_NOT_FOUND
        response = world.client("ada").delete(o_url(world.a1, f"sites/{site_a2.pk}/"))
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert Site.objects.filter(pk=site_a2.pk).exists()


class TestNetworks:
    def test_deny_override_is_enforced(self, world):
        response = world.client("carl").get(o_url(world.a1, "networks/"))
        assert response.status_code == status.HTTP_403_FORBIDDEN
        response = world.client("carl").get(o_url(world.a2, "networks/"))
        assert response.status_code == status.HTTP_200_OK

    def test_parent_site_must_belong_to_the_organization(self, world):
        response = world.client("ada").post(
            o_url(world.a1, "networks/"),
            {"name": "Sneaky", "site": str(world.sites["A2"].pk)},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "site" in response.data

    def test_moving_a_network_to_another_organization_is_rejected(self, world):
        network = world.networks["A1"]
        response = world.client("ada").patch(
            o_url(world.a1, f"networks/{network.pk}/"),
            {"site": str(world.sites["A2"].pk)},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_site_filter_rejects_foreign_sites(self, world):
        client = world.client("ada")
        foreign = client.get(
            o_url(world.a1, "networks/"),
            {"site": str(world.sites["A2"].pk)},
        )
        assert foreign.status_code == status.HTTP_400_BAD_REQUEST
        own = client.get(
            o_url(world.a1, "networks/"),
            {"site": str(world.sites["A1"].pk)},
        )
        assert ids(own) == {str(world.networks["A1"].pk)}

    def test_search_never_crosses_organizations(self, world):
        response = world.client("ada").get(
            o_url(world.a1, "networks/"),
            {"search": "lan"},
        )
        assert ids(response) == {str(world.networks["A1"].pk)}

    def test_invalid_cidr(self, world):
        response = world.client("ada").post(
            o_url(world.a1, "networks/"),
            {"name": "Bad", "site": str(world.sites["A1"].pk), "cidr": "192.0.2.1/24"},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


# ---------------------------------------------------------------- access management


class TestAccessManagement:
    def test_override_api_round_trip(self, world):
        owner = world.client("ada")
        response = owner.post(
            o_url(world.a2, "overrides/"),
            {
                "user": world.users["peter"].pk,
                "permission": "sites.view",
                "effect": "deny",
            },
        )
        assert response.status_code == status.HTTP_201_CREATED, response.data
        assert (
            world.client("peter").get(o_url(world.a2, "sites/")).status_code
            == status.HTTP_403_FORBIDDEN
        )
        override_id = response.data["id"]
        response = owner.delete(o_url(world.a2, f"overrides/{override_id}/"))
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert (
            world.client("peter").get(o_url(world.a2, "sites/")).status_code
            == status.HTTP_200_OK
        )

    def test_override_of_another_organization_is_not_found(self, world):
        override = PermissionOverride.objects.get(user=world.users["carl"])  # in A1
        response = world.client("ada").delete(
            o_url(world.a2, f"overrides/{override.pk}/"),
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert PermissionOverride.objects.filter(pk=override.pk).exists()

    def test_viewer_cannot_manage_overrides(self, world):
        response = world.client("peter").post(
            o_url(world.a2, "overrides/"),
            {
                "user": world.users["peter"].pk,
                "permission": "sites.manage",
                "effect": "grant",
            },
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_access_list_explains_sources(self, world):
        response = world.client("ada").get(o_url(world.a1, "access/"))
        assert response.status_code == status.HTTP_200_OK
        by_email = {row["user"]["email"]: row for row in response.data}
        assert set(by_email) == {
            "ada@example.test",
            "john@example.test",
            "mary@example.test",
            "carl@example.test",
            "sarah@example.test",
        }
        carl = {d["permission"]: d for d in by_email["carl@example.test"]["decisions"]}
        assert carl["networks.view"] == {
            "permission": "networks.view",
            "allowed": False,
            "source": "override",
        }
        assert carl["sites.view"]["source"] == "tenant_role"

    def test_scoped_admin_manages_members_of_selected_organizations_only(
        self,
        world,
        scoped_admin,
    ):
        client = api_client(scoped_admin)
        email = {"email": world.users["peter"].email}
        response = client.post(o_url(world.a1, "members/"), email)
        assert response.status_code == status.HTTP_201_CREATED
        assert (
            world.client("peter").get(o_url(world.a1, "sites/")).status_code
            == status.HTTP_200_OK
        )
        outside = client.post(o_url(world.a2, "members/"), email)
        assert outside.status_code == status.HTTP_404_NOT_FOUND

    def test_cannot_add_yourself(self, world):
        response = world.client("john").post(
            o_url(world.a1, "members/"),
            {"email": world.users["john"].email, "role": "owner"},
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN


class TestActivity:
    def test_tenant_activity(self, world):
        url = t_url(world.tenant_a, "activity/")
        assert world.client("john").get(url).status_code == status.HTTP_200_OK
        assert world.client("carl").get(url).status_code == status.HTTP_403_FORBIDDEN

    def test_organization_activity_is_scoped(self, world):
        world.client("ada").post(o_url(world.a1, "sites/"), {"name": "One"})
        world.client("ada").post(o_url(world.a2, "sites/"), {"name": "Two"})
        response = world.client("ada").get(o_url(world.a1, "activity/"))
        names = {e["target_name"] for e in response.data["results"]}
        assert names == {"One"}
        # Every role may read it (mary: operator through the Tenant); no standing: 404.
        assert (
            world.client("mary").get(o_url(world.a1, "activity/")).status_code
            == status.HTTP_200_OK
        )
        assert (
            world.client("david").get(o_url(world.a1, "activity/")).status_code
            == status.HTTP_404_NOT_FOUND
        )


READ_ONLY_PAGES = ["members/", "invitations/", "overrides/", "access/", "activity/"]


class TestReadOnlyOrganizationPages:
    """Members, Permissions and Activity: every role holds members.view and
    activity.view (direct viewer, default role through the Tenant); changes need
    members.manage. Both view permissions can be denied per person."""

    @pytest.mark.parametrize("path", READ_ONLY_PAGES)
    @pytest.mark.parametrize(
        ("user", "org"),
        [
            ("peter", "a2"),  # direct Viewer
            ("sarah", "a1"),  # Tenant member, default role Viewer
            ("mary", "a1"),  # Tenant member, default role Operator
        ],
    )
    def test_viewers_can_read(self, world, user, org, path):
        organization = getattr(world, org)
        response = world.client(user).get(o_url(organization, path))
        assert response.status_code == status.HTTP_200_OK

    @pytest.mark.parametrize("path", READ_ONLY_PAGES)
    def test_no_standing_is_not_found(self, world, path):
        # peter only reaches A2; david reaches no Organization.
        for user in ("peter", "david", "outsider"):
            response = world.client(user).get(o_url(world.a1, path))
            assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_deny_override_hides_the_pages(self, world):
        PermissionOverride.objects.create(
            organization=world.a2,
            user=world.users["peter"],
            permission=Permission.VIEW_MEMBERS,
            effect=Effect.DENY,
        )
        PermissionOverride.objects.create(
            organization=world.a2,
            user=world.users["peter"],
            permission=Permission.VIEW_ACTIVITY,
            effect=Effect.DENY,
        )
        viewer = world.client("peter")
        for path in READ_ONLY_PAGES:
            response = viewer.get(o_url(world.a2, path))
            assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_viewers_cannot_change_anything(self, world):
        viewer = world.client("peter")
        member = world.client("ada").post(
            o_url(world.a2, "members/"),
            {"email": world.users["mary"].email},
        )
        assert member.status_code == status.HTTP_201_CREATED
        membership_id = member.data["membership"]["id"]
        invitation = world.client("ada").post(
            o_url(world.a2, "members/"),
            {"email": "new.person@gmail.com"},
        )
        invitation_id = invitation.data["invitation"]["id"]
        override = world.client("ada").post(
            o_url(world.a2, "overrides/"),
            {
                "user": world.users["mary"].id,
                "permission": "sites.manage",
                "effect": "grant",
            },
        )
        override_id = override.data["id"]

        forbidden = [
            viewer.post(o_url(world.a2, "members/"), {"email": "x@gmail.com"}),
            viewer.patch(
                o_url(world.a2, f"members/{membership_id}/"),
                {"role": "admin"},
            ),
            viewer.delete(o_url(world.a2, f"members/{membership_id}/")),
            viewer.post(o_url(world.a2, f"invitations/{invitation_id}/resend/")),
            viewer.delete(o_url(world.a2, f"invitations/{invitation_id}/")),
            viewer.post(
                o_url(world.a2, "overrides/"),
                {
                    "user": world.users["mary"].id,
                    "permission": "networks.manage",
                    "effect": "grant",
                },
            ),
            viewer.patch(
                o_url(world.a2, f"overrides/{override_id}/"),
                {"effect": "deny"},
            ),
            viewer.delete(o_url(world.a2, f"overrides/{override_id}/")),
        ]
        assert all(r.status_code == status.HTTP_403_FORBIDDEN for r in forbidden)


# ---------------------------------------------------------------- platform


class TestPlatformAdmin:
    """Staff manage Tenants in Django admin; the API gives them no tenant data."""

    def test_no_platform_api(self, platform_admin):
        response = api_client(platform_admin).get("/api/platform/tenants/")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_platform_admin_sees_no_tenant_data_without_membership(
        self,
        world,
        platform_admin,
    ):
        client = api_client(platform_admin)
        assert client.get("/api/tenants/").data == []
        assert (
            client.get(o_url(world.a1, "sites/")).status_code
            == status.HTTP_404_NOT_FOUND
        )
        assert (
            client.get(t_url(world.tenant_a, "members/")).status_code
            == status.HTTP_404_NOT_FOUND
        )
