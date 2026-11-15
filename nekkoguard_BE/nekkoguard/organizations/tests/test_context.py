"""Default Tenant to open (rules 2 and 3; rule 1 lives in the browser)."""

from __future__ import annotations

import pytest

from nekkoguard.organizations.context import DEMO_TENANT_ID
from nekkoguard.organizations.context import default_tenant_id
from nekkoguard.organizations.roles import OrganizationAccess
from nekkoguard.organizations.roles import TenantRole
from nekkoguard.users.tests.factories import UserFactory

from .conftest import api_client
from .factories import OrganizationFactory
from .factories import TenantFactory
from .factories import TenantMembershipFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def demo(world):
    """The seeded demo Tenant; its name sorts after "Tenant A"/"Tenant B" on purpose."""
    tenant = TenantFactory(id=DEMO_TENANT_ID, name="Zz NekkoGuard Demo")
    OrganizationFactory(tenant=tenant, name="Demo Customer")
    return tenant


@pytest.fixture
def superuser(db):
    return UserFactory(is_superuser=True, is_staff=True)


class TestRule2FirstOrganization:
    def test_first_tenant_with_an_organization(self, world):
        # sarah reaches organizations in Tenant A and Tenant B.
        assert default_tenant_id(world.sarah) == world.tenant_a.pk

    def test_skips_tenants_without_reachable_organizations(self, world):
        user = UserFactory()
        TenantMembershipFactory(tenant=world.tenant_a, user=user, role=TenantRole.ADMIN)
        TenantMembershipFactory(
            tenant=world.tenant_b,
            user=user,
            organization_access=OrganizationAccess.ALL,
        )
        assert default_tenant_id(user) == world.tenant_b.pk

    def test_falls_back_to_first_visible_tenant(self, world):
        # john administers Tenant A but reaches none of its organizations.
        assert default_tenant_id(world.john) == world.tenant_a.pk

    def test_nothing_for_users_without_access(self, world):
        assert default_tenant_id(world.outsider) is None

    def test_demo_is_not_forced_on_regular_users(self, world, demo):
        assert default_tenant_id(world.sarah) == world.tenant_a.pk


class TestRule3SuperuserDemo:
    def test_superuser_without_memberships_opens_the_demo(self, world, demo, superuser):
        assert default_tenant_id(superuser) == DEMO_TENANT_ID

    def test_without_demo_tenant_rule_2_applies(self, world, superuser):
        assert default_tenant_id(superuser) == world.tenant_a.pk

    def test_demo_without_organizations_is_skipped(self, world, superuser):
        TenantFactory(id=DEMO_TENANT_ID, name="Zz NekkoGuard Demo")
        assert default_tenant_id(superuser) == world.tenant_a.pk

    def test_superuser_with_a_membership_follows_rule_2(self, world, demo, superuser):
        TenantMembershipFactory(
            tenant=world.tenant_b,
            user=superuser,
            organization_access=OrganizationAccess.ALL,
        )
        assert default_tenant_id(superuser) == world.tenant_a.pk


def test_tenant_list_marks_exactly_one_default(world, demo, superuser):
    data = api_client(superuser).get("/api/tenants/").data
    defaults = [item["id"] for item in data if item["is_default"]]
    assert defaults == [str(DEMO_TENANT_ID)]

    data = world.client("sarah").get("/api/tenants/").data
    defaults = [item["id"] for item in data if item["is_default"]]
    assert defaults == [str(world.tenant_a.pk)]


class TestMyOrganizations:
    """GET /api/organizations/: what the organization switcher offers."""

    URL = "/api/organizations/"

    def names(self, client):
        return [(o["tenant_name"], o["name"]) for o in client.get(self.URL).data]

    def test_all_tenants_grouped_by_tenant_name(self, world):
        assert self.names(world.client("sarah")) == [
            ("Tenant A", "A1"),
            ("Tenant A", "A2"),
            ("Tenant B", "B1"),
        ]

    def test_only_organizations_the_user_can_open(self, world):
        assert self.names(world.client("mary")) == [("Tenant A", "A1")]
        assert self.names(world.client("peter")) == [("Tenant A", "A2")]
        assert self.names(world.client("john")) == [
            ("Tenant A", "A1"),
            ("Tenant A", "A2"),
        ]
        assert self.names(world.client("outsider")) == []

    def test_admin_without_organization_access_opens_nothing(self, world, no_org_admin):
        assert self.names(api_client(no_org_admin)) == []

    def test_inactive_organizations_are_hidden(self, world):
        world.a2.is_active = False
        world.a2.save()
        assert ("Tenant A", "A2") not in self.names(world.client("sarah"))

    def test_anonymous_is_rejected(self, world):
        assert api_client().get(self.URL).status_code in {401, 403}
