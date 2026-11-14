"""Write rules: privilege-escalation prevention, owner invariant, tenant isolation."""

from __future__ import annotations

import pytest
from rest_framework.exceptions import PermissionDenied
from rest_framework.exceptions import ValidationError

from nekkoguard.organizations import access
from nekkoguard.organizations import services
from nekkoguard.organizations.models import ActivityEntry
from nekkoguard.organizations.models import MembershipStatus
from nekkoguard.organizations.models import OrganizationMembership
from nekkoguard.organizations.models import TenantMembership
from nekkoguard.organizations.roles import Effect
from nekkoguard.organizations.roles import OrganizationAccess as Access
from nekkoguard.organizations.roles import OrganizationRole as OrgRole
from nekkoguard.organizations.roles import Permission
from nekkoguard.organizations.roles import TenantRole
from nekkoguard.users.tests.factories import UserFactory

from .factories import OrganizationFactory

pytestmark = pytest.mark.django_db


def tenant_actor(world, name, tenant="tenant_a"):
    return access.get_tenant_access(world.users[name], getattr(world, tenant))


def org_actor(world, name, org):
    organization = getattr(world, org)
    user = world.users[name]
    return services.OrganizationActor(
        user=user,
        organization=organization,
        tenant_access=access.get_tenant_access(user, organization.tenant),
        context=access.get_organization_access(user, organization),
    )


def membership(world, name, tenant="tenant_a"):
    return TenantMembership.objects.get(
        user=world.users[name],
        tenant=getattr(world, tenant),
    )


# ---------------------------------------------------------------- tenant members


class TestTenantMembers:
    def test_admin_adds_member_with_selected_access(self, world):
        new = UserFactory()
        created = services.add_tenant_member(
            actor=tenant_actor(world, "john"),
            user=new,
            role=TenantRole.MEMBER,
            organization_access=Access.SELECTED,
            default_organization_role=OrgRole.VIEWER,
            selected_organizations=[world.a2],
        )
        assert access.get_organization_access(new, world.a2) is not None
        assert access.get_organization_access(new, world.a1) is None
        entry = ActivityEntry.objects.get(action="tenant_member.added")
        assert entry.details["selected_organizations"] == [str(world.a2.pk)]
        assert entry.target_id == str(created.pk)

    def test_cannot_select_an_organization_of_another_tenant(self, world):
        with pytest.raises(ValidationError):
            services.add_tenant_member(
                actor=tenant_actor(world, "john"),
                user=UserFactory(),
                role=TenantRole.MEMBER,
                organization_access=Access.SELECTED,
                default_organization_role=OrgRole.VIEWER,
                selected_organizations=[world.b1],
            )

    def test_access_requires_a_default_role(self, world):
        with pytest.raises(ValidationError):
            services.add_tenant_member(
                actor=tenant_actor(world, "john"),
                user=UserFactory(),
                role=TenantRole.MEMBER,
                organization_access=Access.ALL,
            )

    def test_member_cannot_manage_members(self, world):
        with pytest.raises(PermissionDenied):
            services.add_tenant_member(
                actor=tenant_actor(world, "david"),
                user=UserFactory(),
                role=TenantRole.MEMBER,
            )

    def test_admin_cannot_create_owner(self, world):
        with pytest.raises(PermissionDenied):
            services.add_tenant_member(
                actor=tenant_actor(world, "john"),
                user=UserFactory(),
                role=TenantRole.OWNER,
            )

    def test_admin_cannot_change_owner(self, world):
        with pytest.raises(PermissionDenied):
            services.update_tenant_member(
                actor=tenant_actor(world, "john"),
                target=membership(world, "owner"),
                organization_access=Access.NONE,
            )

    def test_admin_cannot_change_own_membership(self, world):
        with pytest.raises(PermissionDenied):
            services.update_tenant_member(
                actor=tenant_actor(world, "john"),
                target=membership(world, "john"),
                organization_access=Access.ALL,
                default_organization_role=OrgRole.ADMIN,
            )

    def test_owner_may_change_own_access_but_not_own_role(self, world):
        actor = tenant_actor(world, "owner")
        services.update_tenant_member(
            actor=actor,
            target=membership(world, "owner"),
            organization_access=Access.SELECTED,
            selected_organizations=[world.a1],
        )
        assert access.get_organization_access(world.users["owner"], world.a2) is None
        with pytest.raises(PermissionDenied):
            services.update_tenant_member(
                actor=actor,
                target=membership(world, "owner"),
                role=TenantRole.MEMBER,
            )

    def test_policy_change_takes_effect_and_is_audited(self, world):
        services.update_tenant_member(
            actor=tenant_actor(world, "john"),
            target=membership(world, "carl"),
            organization_access=Access.NONE,
        )
        carl = membership(world, "carl")
        assert carl.default_organization_role == ""
        assert access.get_organization_access(world.users["carl"], world.a2) is None
        entry = ActivityEntry.objects.get(action="tenant_member.updated")
        assert entry.details["organization_access"] == ["all", "none"]

    def test_switching_away_from_selected_clears_selection(self, world):
        services.update_tenant_member(
            actor=tenant_actor(world, "john"),
            target=membership(world, "mary"),
            organization_access=Access.ALL,
        )
        assert not membership(world, "mary").organization_grants.exists()

    def test_owner_may_suspend_another_owner(self, world):
        second_owner = UserFactory()
        services.add_tenant_member(
            actor=tenant_actor(world, "owner"),
            user=second_owner,
            role=TenantRole.OWNER,
        )
        services.update_tenant_member(
            actor=access.get_tenant_access(second_owner, world.tenant_a),
            target=membership(world, "owner"),
            status=MembershipStatus.SUSPENDED,
        )
        assert tenant_actor(world, "owner") is None

    def test_last_active_owner_is_protected(self, world):
        # Defense in depth: the API paths cannot reach this state (actors that may
        # touch owners are active owners themselves), so test the guard directly.
        with pytest.raises(ValidationError):
            services._ensure_owner_remains(  # noqa: SLF001
                membership(world, "owner"),
                stays_owner=False,
            )

    def test_tenant_actor_from_other_tenant_cannot_touch_members(self, world):
        # Services always work in the actor's own tenant.
        new = UserFactory()
        created = services.add_tenant_member(
            actor=tenant_actor(world, "b_owner", "tenant_b"),
            user=new,
            role=TenantRole.MEMBER,
        )
        assert created.tenant == world.tenant_b


# ---------------------------------------------------------------- organizations


class TestOrganizations:
    def test_creating_an_organization_grants_no_access(self, world):
        organization = services.create_organization(
            actor=tenant_actor(world, "john"),
            name="New Org",
            description="",
        )
        assert organization.tenant == world.tenant_a
        assert access.get_organization_access(world.users["john"], organization) is None
        assert ActivityEntry.objects.filter(
            action="organization.created",
            organization=organization,
        ).exists()

    def test_member_cannot_create_organizations(self, world):
        with pytest.raises(PermissionDenied):
            services.create_organization(
                actor=tenant_actor(world, "carl"),
                name="Nope",
                description="",
            )


# ---------------------------------------------------------------- organization access


class TestOrganizationMembers:
    def test_tenant_admin_manages_organization_members_without_access(self, world):
        new = UserFactory()
        services.add_organization_member(
            actor=org_actor(world, "john", "a1"),
            user=new,
            role=OrgRole.OPERATOR,
        )
        assert access.get_organization_access(new, world.a1) is not None

    def test_nobody_changes_their_own_access(self, world):
        with pytest.raises(PermissionDenied):
            services.add_organization_member(
                actor=org_actor(world, "john", "a1"),
                user=world.users["john"],
                role=OrgRole.OWNER,
            )

    def test_viewer_cannot_manage_members(self, world):
        with pytest.raises(PermissionDenied):
            services.add_organization_member(
                actor=org_actor(world, "peter", "a2"),
                user=UserFactory(),
                role=OrgRole.VIEWER,
            )

    def test_organization_admin_cannot_assign_owner(self, world):
        org_admin = UserFactory()
        OrganizationMembership.objects.create(
            organization=world.a2,
            user=org_admin,
            role=OrgRole.ADMIN,
        )
        actor = services.OrganizationActor(
            user=org_admin,
            organization=world.a2,
            tenant_access=None,
            context=access.get_organization_access(org_admin, world.a2),
        )
        with pytest.raises(PermissionDenied):
            services.add_organization_member(
                actor=actor,
                user=UserFactory(),
                role=OrgRole.OWNER,
            )
        services.add_organization_member(
            actor=actor,
            user=UserFactory(),
            role=OrgRole.ADMIN,
        )

    def test_organization_manager_cannot_touch_tenant_administrators(self, world):
        org_owner = UserFactory()
        OrganizationMembership.objects.create(
            organization=world.a1,
            user=org_owner,
            role=OrgRole.OWNER,
        )
        actor = services.OrganizationActor(
            user=org_owner,
            organization=world.a1,
            tenant_access=None,
            context=access.get_organization_access(org_owner, world.a1),
        )
        with pytest.raises(PermissionDenied):
            services.set_permission_override(
                actor=actor,
                user=world.users["owner"],
                permission=Permission.VIEW_SITES,
                effect=Effect.DENY,
            )

    def test_tenant_admin_cannot_change_tenant_owner_access(self, world):
        with pytest.raises(PermissionDenied):
            services.set_permission_override(
                actor=org_actor(world, "john", "a1"),
                user=world.users["owner"],
                permission=Permission.VIEW_SITES,
                effect=Effect.DENY,
            )


class TestOverrides:
    def test_override_upsert_and_removal_back_to_inherit(self, world):
        actor = org_actor(world, "owner", "a1")
        carl = world.users["carl"]
        override = services.set_permission_override(
            actor=actor,
            user=carl,
            permission=Permission.VIEW_NETWORKS,
            effect=Effect.GRANT,
        )
        assert access.resolve_permission(carl, world.a1, Permission.VIEW_NETWORKS)
        services.remove_permission_override(actor=actor, override=override)
        # Back to INHERIT: operator default role includes networks.view.
        assert access.resolve_permission(carl, world.a1, Permission.VIEW_NETWORKS)
        actions = list(
            ActivityEntry.objects.filter(
                action__startswith="permission_override",
            ).values_list("action", flat=True),
        )
        assert sorted(actions) == [
            "permission_override.removed",
            "permission_override.set",
        ]

    def test_organization_manager_grants_only_what_they_hold(self, world):
        org_admin = UserFactory()
        OrganizationMembership.objects.create(
            organization=world.a2,
            user=org_admin,
            role=OrgRole.ADMIN,
        )
        # Strip the admin's own manage permission via a tenant manager…
        services.set_permission_override(
            actor=org_actor(world, "owner", "a2"),
            user=org_admin,
            permission=Permission.MANAGE_SITES,
            effect=Effect.DENY,
        )
        actor = services.OrganizationActor(
            user=org_admin,
            organization=world.a2,
            tenant_access=None,
            context=access.get_organization_access(org_admin, world.a2),
        )
        # …now they cannot hand it out to someone else.
        with pytest.raises(PermissionDenied):
            services.set_permission_override(
                actor=actor,
                user=world.users["peter"],
                permission=Permission.MANAGE_SITES,
                effect=Effect.GRANT,
            )
        # Denying is still allowed (it never escalates).
        services.set_permission_override(
            actor=actor,
            user=world.users["peter"],
            permission=Permission.VIEW_NETWORKS,
            effect=Effect.DENY,
        )

    def test_override_target_must_belong_to_tenant_or_organization(self, world):
        with pytest.raises(ValidationError):
            services.set_permission_override(
                actor=org_actor(world, "owner", "a1"),
                user=world.users["outsider"],
                permission=Permission.VIEW_SITES,
                effect=Effect.GRANT,
            )

    def test_override_for_tenant_b_user_is_rejected_in_tenant_a(self, world):
        with pytest.raises(ValidationError):
            services.set_permission_override(
                actor=org_actor(world, "owner", "a1"),
                user=world.users["b_owner"],
                permission=Permission.VIEW_SITES,
                effect=Effect.GRANT,
            )


def test_selected_access_model_validation_rejects_other_tenant(world):
    from django.core.exceptions import ValidationError as DjangoValidationError  # noqa: PLC0415

    from nekkoguard.organizations.models import TenantOrganizationAccess  # noqa: PLC0415

    grant = TenantOrganizationAccess(
        membership=membership(world, "mary"),
        organization=OrganizationFactory(tenant=world.tenant_b),
    )
    with pytest.raises(DjangoValidationError):
        grant.clean()
