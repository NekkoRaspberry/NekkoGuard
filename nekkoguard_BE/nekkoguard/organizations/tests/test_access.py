"""The access resolver: scenarios A-F, policies, GRANT/DENY/INHERIT, suspensions."""

from __future__ import annotations

import pytest

from nekkoguard.organizations import access
from nekkoguard.organizations.access import Source
from nekkoguard.organizations.models import MembershipStatus
from nekkoguard.organizations.models import OrganizationMembership
from nekkoguard.organizations.models import PermissionOverride
from nekkoguard.organizations.models import TenantMembership
from nekkoguard.organizations.roles import Effect
from nekkoguard.organizations.roles import OrganizationRole
from nekkoguard.organizations.roles import Permission
from nekkoguard.organizations.roles import TenantPermission

from .conftest import World
from .conftest import build_world

pytestmark = pytest.mark.django_db

READ = {Permission.VIEW_SITES, Permission.VIEW_NETWORKS}


def ctx(world: World, user: str, org: str):
    return access.get_organization_access(world.users[user], getattr(world, org))


def tenant_access(world: World, user: str, tenant: str = "tenant_a"):
    return access.get_tenant_access(world.users[user], getattr(world, tenant))


# ---------------------------------------------------------------- scenarios


class TestScenarioATenantAdministrator:
    def test_administers_the_tenant(self, world):
        ta = tenant_access(world, "john")
        assert ta is not None
        assert ta.can(TenantPermission.MANAGE_MEMBERS)
        assert ta.can(TenantPermission.MANAGE_ORGANIZATIONS)

    def test_tenant_administration_is_not_infrastructure_access(self, world):
        assert ctx(world, "john", "a1") is None
        assert ctx(world, "john", "a2") is None


class TestScenarioBInheritedSelectedAccess:
    def test_inherits_default_role_in_selected_organization(self, world):
        context = ctx(world, "mary", "a1")
        assert context is not None
        assert context.membership is None
        assert context.via_tenant
        assert context.permissions == READ
        assert context.decisions[Permission.VIEW_SITES].source == Source.TENANT_ROLE

    def test_no_access_to_unselected_organization(self, world):
        assert ctx(world, "mary", "a2") is None

    def test_no_tenant_administration(self, world):
        ta = tenant_access(world, "mary")
        assert ta.permissions == {TenantPermission.VIEW}


class TestScenarioCOrganizationOverride:
    def test_deny_override_beats_inherited_grant(self, world):
        context = ctx(world, "carl", "a1")
        assert not context.can(Permission.VIEW_NETWORKS)
        assert context.decisions[Permission.VIEW_NETWORKS].source == Source.OVERRIDE
        # Permissions without an override still inherit.
        assert context.can(Permission.VIEW_SITES)

    def test_override_only_affects_its_organization(self, world):
        assert ctx(world, "carl", "a2").can(Permission.VIEW_NETWORKS)


class TestScenarioDDirectOrganizationMember:
    def test_accesses_own_organization_with_its_role(self, world):
        context = ctx(world, "peter", "a2")
        assert context.permissions == READ
        assert (
            context.decisions[Permission.VIEW_SITES].source == Source.ORGANIZATION_ROLE
        )
        assert context.tenant_membership is None

    def test_no_other_organizations_and_no_tenant_administration(self, world):
        assert ctx(world, "peter", "a1") is None
        assert ctx(world, "peter", "b1") is None
        assert tenant_access(world, "peter") is None


class TestScenarioEMultipleTenants:
    def test_different_standing_per_tenant(self, world):
        assert tenant_access(world, "sarah", "tenant_a").permissions == {
            TenantPermission.VIEW,
        }
        assert tenant_access(world, "sarah", "tenant_b").can(
            TenantPermission.MANAGE_MEMBERS,
        )
        assert not ctx(world, "sarah", "a1").can(Permission.MANAGE_SITES)
        assert ctx(world, "sarah", "b1").can(Permission.MANAGE_SITES)

    def test_listings_cover_both_tenants_only(self, world):
        tenants = set(access.visible_tenants(world.users["sarah"]))
        assert tenants == {world.tenant_a, world.tenant_b}


class TestScenarioFTenantMemberWithoutOrganizationAccess:
    def test_tenant_view_only(self, world):
        assert tenant_access(world, "david").permissions == {TenantPermission.VIEW}
        assert ctx(world, "david", "a1") is None
        assert ctx(world, "david", "a2") is None

    def test_direct_membership_still_grants_access(self, world):
        OrganizationMembership.objects.create(
            organization=world.a2,
            user=world.users["david"],
            role=OrganizationRole.OPERATOR,
        )
        assert ctx(world, "david", "a2").permissions == READ
        assert ctx(world, "david", "a1") is None


# ---------------------------------------------------------------- permission states


def _override(world, user, org, permission, effect):
    PermissionOverride.objects.update_or_create(
        organization=getattr(world, org),
        user=world.users[user],
        permission=permission,
        defaults={"effect": effect},
    )


class TestPermissionStates:
    def test_grant_override_adds_a_permission(self, world):
        _override(world, "mary", "a1", Permission.MANAGE_SITES, Effect.GRANT)
        context = ctx(world, "mary", "a1")
        assert context.can(Permission.MANAGE_SITES)
        assert context.decisions[Permission.MANAGE_SITES].source == Source.OVERRIDE

    def test_deny_override_removes_a_direct_role_permission(self, world):
        _override(world, "peter", "a2", Permission.VIEW_SITES, Effect.DENY)
        assert not ctx(world, "peter", "a2").can(Permission.VIEW_SITES)

    def test_inherit_without_tenant_permission_is_denied(self, world):
        # Peter has no Tenant path: what his role lacks stays denied.
        decision = ctx(world, "peter", "a2").decisions[Permission.MANAGE_SITES]
        assert not decision.allowed
        assert decision.source == Source.NONE

    def test_direct_role_and_inherited_role_combine(self, world):
        # Mary also gets a direct role in A1: both sources apply per permission.
        OrganizationMembership.objects.create(
            organization=world.a1,
            user=world.users["mary"],
            role=OrganizationRole.VIEWER,
        )
        _override(world, "mary", "a1", Permission.VIEW_ACTIVITY, Effect.GRANT)
        context = ctx(world, "mary", "a1")
        assert (
            context.decisions[Permission.VIEW_SITES].source == Source.ORGANIZATION_ROLE
        )
        assert context.can(Permission.VIEW_ACTIVITY)
        assert not context.can(Permission.MANAGE_SITES)

    def test_explicit_deny_beats_direct_and_inherited_grant(self, world):
        OrganizationMembership.objects.create(
            organization=world.a1,
            user=world.users["owner"],
            role=OrganizationRole.OWNER,
        )
        _override(world, "owner", "a1", Permission.MANAGE_SITES, Effect.DENY)
        assert not ctx(world, "owner", "a1").can(Permission.MANAGE_SITES)

    def test_override_never_creates_access(self, world):
        _override(world, "david", "a1", Permission.VIEW_SITES, Effect.GRANT)
        _override(world, "outsider", "a1", Permission.VIEW_SITES, Effect.GRANT)
        assert ctx(world, "david", "a1") is None
        assert ctx(world, "outsider", "a1") is None

    def test_resolve_permission_helper(self, world):
        assert access.resolve_permission(
            world.users["carl"],
            world.a1,
            Permission.VIEW_SITES,
        )
        assert not access.resolve_permission(
            world.users["carl"],
            world.a1,
            Permission.VIEW_NETWORKS,
        )
        assert not access.resolve_permission(
            world.users["outsider"],
            world.a1,
            Permission.VIEW_SITES,
        )


# ---------------------------------------------------------------- policies


class TestPolicies:
    def test_all_organizations(self, world):
        assert ctx(world, "carl", "a1") is not None
        assert ctx(world, "carl", "a2") is not None

    def test_all_organizations_never_crosses_tenants(self, world):
        assert ctx(world, "carl", "b1") is None
        assert ctx(world, "owner", "b1") is None

    def test_new_organization_reached_by_all_policy_only(self, world):
        from .factories import OrganizationFactory  # noqa: PLC0415

        a3 = OrganizationFactory(tenant=world.tenant_a, name="A3")
        assert access.get_organization_access(world.users["carl"], a3) is not None
        assert access.get_organization_access(world.users["mary"], a3) is None


# ---------------------------------------------------------------- restrictions


def _suspend_tenant(world, user, tenant="tenant_a"):
    TenantMembership.objects.filter(
        user=world.users[user],
        tenant=getattr(world, tenant),
    ).update(status=MembershipStatus.SUSPENDED)


class TestRestrictions:
    def test_suspended_tenant_membership_blocks_everything_in_tenant(self, world):
        OrganizationMembership.objects.create(
            organization=world.a1,
            user=world.users["carl"],
            role=OrganizationRole.ADMIN,
        )
        _suspend_tenant(world, "carl")
        assert tenant_access(world, "carl") is None
        assert ctx(world, "carl", "a1") is None  # even with a direct membership
        assert ctx(world, "carl", "a2") is None

    def test_suspension_in_one_tenant_keeps_the_other(self, world):
        _suspend_tenant(world, "sarah", "tenant_a")
        assert ctx(world, "sarah", "a1") is None
        assert ctx(world, "sarah", "b1") is not None

    def test_suspended_organization_membership_blocks_inherited_access(self, world):
        OrganizationMembership.objects.create(
            organization=world.a1,
            user=world.users["carl"],
            role=OrganizationRole.VIEWER,
            status=MembershipStatus.SUSPENDED,
        )
        assert ctx(world, "carl", "a1") is None
        assert ctx(world, "carl", "a2") is not None

    def test_removed_membership_grants_nothing(self, world):
        OrganizationMembership.objects.filter(user=world.users["peter"]).delete()
        assert ctx(world, "peter", "a2") is None

    def test_inactive_user(self, world):
        user = world.users["owner"]
        user.is_active = False
        user.save()
        assert ctx(world, "owner", "a1") is None
        assert tenant_access(world, "owner") is None

    def test_inactive_organization(self, world):
        world.a1.is_active = False
        world.a1.save()
        assert ctx(world, "owner", "a1") is None

    def test_inactive_tenant(self, world):
        world.tenant_a.is_active = False
        world.tenant_a.save()
        world.a2.refresh_from_db()
        assert ctx(world, "peter", "a2") is None
        assert tenant_access(world, "owner") is None


# ---------------------------------------------------------------- consistency


def test_listing_and_resolver_always_agree(db):
    """accessible_organizations() must mirror get_organization_access()."""
    world = build_world()
    # Add the tricky states too.
    _suspend_tenant(world, "sarah", "tenant_a")
    OrganizationMembership.objects.create(
        organization=world.a1,
        user=world.users["carl"],
        role=OrganizationRole.VIEWER,
        status=MembershipStatus.SUSPENDED,
    )
    organizations = [world.a1, world.a2, world.b1]
    for user in world.users.values():
        listed = set(access.accessible_organizations(user))
        resolved = {
            org
            for org in organizations
            if access.get_organization_access(user, org) is not None
        }
        assert listed == resolved, user.email


def test_access_list_matches_individual_resolution(world):
    for org in (world.a1, world.a2, world.b1):
        listed = {
            c.user.pk: c.permissions for c in access.organization_access_list(org)
        }
        individual = {}
        for user in world.users.values():
            context = access.get_organization_access(user, org)
            if context is not None:
                individual[user.pk] = context.permissions
        assert listed == individual, org.name
