"""
A shared "world" with the six scenarios of the access-model specification.

Tenant A: Organizations A1 and A2.   Tenant B: Organization B1.

| user     | Tenant A                                  | direct / other            |
|----------|-------------------------------------------|---------------------------|
| ada      | admin, all orgs, default admin            |                           |
| john     | admin, NO organizations       (A)         |                           |
| mary     | member, selected [A1], operator (B)       |                           |
| carl     | member, all orgs, operator   (C)          | DENY networks.view in A1  |
| peter    | —                            (D)          | viewer in A2              |
| sarah    | member, all orgs, viewer     (E)          | Tenant B: admin, all, admin |
| david    | member, NO organizations     (F)          |                           |
| outsider | —                                         | —                         |
| b_admin  | —                                         | Tenant B admin, all, admin |
"""

from __future__ import annotations

from dataclasses import dataclass
from dataclasses import field
from typing import TYPE_CHECKING

import pytest
from rest_framework.test import APIClient

from nekkoguard.conftest import enable_totp
from nekkoguard.conftest import sign_in
from nekkoguard.organizations.models import PermissionOverride
from nekkoguard.organizations.models import TenantOrganizationAccess
from nekkoguard.organizations.roles import Effect
from nekkoguard.organizations.roles import OrganizationAccess as Access
from nekkoguard.organizations.roles import OrganizationRole as OrgRole
from nekkoguard.organizations.roles import Permission
from nekkoguard.organizations.roles import TenantRole
from nekkoguard.users.tests.factories import UserFactory

from .factories import NetworkFactory
from .factories import OrganizationFactory
from .factories import OrganizationMembershipFactory
from .factories import SiteFactory
from .factories import TenantFactory
from .factories import TenantMembershipFactory

if TYPE_CHECKING:
    from nekkoguard.organizations.models import Network
    from nekkoguard.organizations.models import Organization
    from nekkoguard.organizations.models import Site
    from nekkoguard.organizations.models import Tenant
    from nekkoguard.users.models import User


def api_client(user: User | None = None) -> APIClient:
    client = APIClient()
    if user is not None:
        sign_in(client, user)  # session; MFA step recorded for users with MFA
    return client


@dataclass
class World:
    tenant_a: Tenant
    tenant_b: Tenant
    a1: Organization
    a2: Organization
    b1: Organization
    users: dict[str, User] = field(default_factory=dict)
    sites: dict[str, Site] = field(default_factory=dict)
    networks: dict[str, Network] = field(default_factory=dict)

    def __getattr__(self, name: str) -> User:
        try:
            return self.__dict__["users"][name]
        except KeyError:
            raise AttributeError(name) from None

    def client(self, name: str) -> APIClient:
        return api_client(self.users[name])


def _member(tenant, user, role, *, access=Access.NONE, default="", selected=()):  # noqa: PLR0913
    if role == TenantRole.ADMIN:
        # Tenant administration requires a session that passed MFA (access.py).
        enable_totp(user)
    membership = TenantMembershipFactory(
        tenant=tenant,
        user=user,
        role=role,
        organization_access=access,
        default_organization_role=default,
    )
    for organization in selected:
        TenantOrganizationAccess.objects.create(
            membership=membership,
            organization=organization,
        )
    return membership


def build_world() -> World:
    tenant_a = TenantFactory(name="Tenant A")
    tenant_b = TenantFactory(name="Tenant B")
    world = World(
        tenant_a=tenant_a,
        tenant_b=tenant_b,
        a1=OrganizationFactory(tenant=tenant_a, name="A1"),
        a2=OrganizationFactory(tenant=tenant_a, name="A2"),
        b1=OrganizationFactory(tenant=tenant_b, name="B1"),
    )
    names = ["ada", "john", "mary", "carl", "peter", "sarah", "david"]
    names += ["outsider", "b_admin"]
    world.users = {n: UserFactory(email=f"{n}@example.test") for n in names}
    u = world.users

    _member(
        tenant_a,
        u["ada"],
        TenantRole.ADMIN,
        access=Access.ALL,
        default=OrgRole.ADMIN,
    )
    # Tenant rights apply only inside the organization scope: john administers all.
    _member(
        tenant_a,
        u["john"],
        TenantRole.ADMIN,
        access=Access.ALL,
        default=OrgRole.VIEWER,
    )
    _member(
        tenant_a,
        u["mary"],
        TenantRole.MEMBER,
        access=Access.SELECTED,
        default=OrgRole.OPERATOR,
        selected=[world.a1],
    )
    _member(
        tenant_a,
        u["carl"],
        TenantRole.MEMBER,
        access=Access.ALL,
        default=OrgRole.OPERATOR,
    )
    PermissionOverride.objects.create(
        organization=world.a1,
        user=u["carl"],
        permission=Permission.VIEW_NETWORKS,
        effect=Effect.DENY,
    )
    OrganizationMembershipFactory(organization=world.a2, user=u["peter"])
    _member(
        tenant_a,
        u["sarah"],
        TenantRole.MEMBER,
        access=Access.ALL,
        default=OrgRole.VIEWER,
    )
    _member(
        tenant_b,
        u["sarah"],
        TenantRole.ADMIN,
        access=Access.ALL,
        default=OrgRole.ADMIN,
    )
    _member(tenant_a, u["david"], TenantRole.MEMBER)
    _member(
        tenant_b,
        u["b_admin"],
        TenantRole.ADMIN,
        access=Access.ALL,
        default=OrgRole.ADMIN,
    )

    for org in (world.a1, world.a2, world.b1):
        site = SiteFactory(organization=org, name=f"{org.name} site")
        world.sites[org.name] = site
        world.networks[org.name] = NetworkFactory(site=site, name=f"{org.name} lan")
    return world


@pytest.fixture
def world(db) -> World:
    return build_world()


@pytest.fixture
def platform_admin(db) -> User:
    user = UserFactory(is_staff=True)
    enable_totp(user)  # platform-level changes need an MFA-verified session
    return user


@pytest.fixture
def scoped_admin(world) -> User:
    """Tenant Administrator of Tenant A limited to the selected organization A1."""
    user = UserFactory(email="scoped@example.test")
    _member(
        world.tenant_a,
        user,
        TenantRole.ADMIN,
        access=Access.SELECTED,
        default=OrgRole.VIEWER,
        selected=[world.a1],
    )
    return user


@pytest.fixture
def no_org_admin(world) -> User:
    """Tenant Administrator of Tenant A with organization access "None"."""
    user = UserFactory(email="noorgs@example.test")
    _member(world.tenant_a, user, TenantRole.ADMIN)
    return user
