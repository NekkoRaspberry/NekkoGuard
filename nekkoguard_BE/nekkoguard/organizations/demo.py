"""
Demo environment for development databases (``manage.py seed_demo``).

It shows the hybrid access model working, without bypassing it: nobody is
a Tenant owner, and every bit of access comes from memberships, policies and
overrides.

| User                       | Standing                                            |
|----------------------------|-----------------------------------------------------|
| admin-demo@example.test    | Tenant admin; access to *selected* Organizations     |
|                            | (NekkoGuard Internal only), default role admin.     |
|                            | → Administers the Tenant, but does not reach the    |
|                            |   Demo Customer's infrastructure.                   |
| operator-demo@example.test | Tenant member; access to *all* Organizations,       |
|                            | default role operator; no direct membership.        |
|                            | Override in Demo Customer: DENY networks.view.      |
|                            | → Inherited access + an Organization override.      |
| client-demo@example.test   | No Tenant membership; direct viewer of Demo         |
|                            | Customer. → Organization-only access.               |

Idempotent: fixed UUIDs and ``get_or_create``. Existing rows are never changed,
and existing users keep their passwords. Network ranges use the reserved
documentation blocks (RFC 5737), so they match no real network.
"""

from __future__ import annotations

import secrets
import uuid
from dataclasses import dataclass
from dataclasses import field

from allauth.account.models import EmailAddress
from django.contrib.auth import get_user_model
from django.db import transaction

from .models import Network
from .models import Organization
from .models import OrganizationMembership
from .models import PermissionOverride
from .models import Site
from .models import Tenant
from .models import TenantMembership
from .models import TenantOrganizationAccess
from .roles import Effect
from .roles import OrganizationAccess
from .roles import OrganizationRole
from .roles import Permission
from .roles import TenantRole
from .services import record_activity

DEMO_NAMESPACE = uuid.UUID("7f9e45a1-faaf-4232-a446-a7e19588757a")

ADMIN_EMAIL = "admin-demo@example.test"
OPERATOR_EMAIL = "operator-demo@example.test"
CLIENT_EMAIL = "client-demo@example.test"
DEMO_EMAILS = (ADMIN_EMAIL, OPERATOR_EMAIL, CLIENT_EMAIL)

# Organization name → {site name → [(network name, CIDR)]}
INFRASTRUCTURE: dict[str, dict[str, list[tuple[str, str]]]] = {
    "NekkoGuard Internal": {
        "Head Office": [("Office LAN", "192.0.2.0/25"), ("Servers", "192.0.2.128/25")],
        "Lab": [("Lab Network", "198.51.100.0/24")],
    },
    "Demo Customer": {
        "Customer HQ": [("Customer LAN", "203.0.113.0/24"), ("Guest Wi-Fi", "")],
    },
}
DESCRIPTIONS = {
    "NekkoGuard Internal": "Example internal infrastructure.",
    "Demo Customer": "Example customer infrastructure.",
}


def demo_id(*parts: str) -> uuid.UUID:
    return uuid.uuid5(DEMO_NAMESPACE, "/".join(parts))


@dataclass
class SeedResult:
    skipped: bool = False
    created_users: list[str] = field(default_factory=list)
    #: Only set when a password was generated (it is shown once, never stored).
    generated_password: str | None = None


def _user(email: str, password: str, result: SeedResult):
    user_model = get_user_model()
    user = user_model.objects.filter(email__iexact=email).first()
    if user is not None:
        return user  # never touch an existing account
    user = user_model.objects.create_user(email=email, password=password)
    user.name = email.split("@", maxsplit=1)[0].replace("-", " ").title()
    user.save(update_fields=["name"])
    EmailAddress.objects.get_or_create(
        user=user,
        email=email,
        defaults={"verified": True, "primary": True},
    )
    result.created_users.append(email)
    return user


@transaction.atomic
def seed_demo(*, password: str | None = None, if_empty: bool = False) -> SeedResult:
    """Create whatever part of the demo environment is missing."""
    result = SeedResult()
    if if_empty and Tenant.objects.exists():
        result.skipped = True
        return result

    if not password:
        password = secrets.token_urlsafe(16)
        result.generated_password = password

    tenant, tenant_created = Tenant.objects.get_or_create(
        id=demo_id("tenant"),
        defaults={
            "name": "NekkoGuard Demo",
            "description": "Demonstration management environment.",
        },
    )
    if tenant_created:
        record_activity(
            tenant=tenant,
            actor=None,
            action="tenant.created",
            target=tenant,
            details={"source": "demo seed"},
        )

    organizations: dict[str, Organization] = {}
    for org_name, sites in INFRASTRUCTURE.items():
        organization, _ = Organization.objects.get_or_create(
            id=demo_id("organization", org_name),
            defaults={
                "tenant": tenant,
                "name": org_name,
                "description": DESCRIPTIONS[org_name],
            },
        )
        organizations[org_name] = organization
        for site_name, networks in sites.items():
            site, _ = Site.objects.get_or_create(
                id=demo_id("site", org_name, site_name),
                defaults={"organization": organization, "name": site_name},
            )
            for network_name, cidr in networks:
                Network.objects.get_or_create(
                    id=demo_id("network", org_name, site_name, network_name),
                    defaults={"site": site, "name": network_name, "cidr": cidr},
                )
    internal = organizations["NekkoGuard Internal"]
    customer = organizations["Demo Customer"]

    admin = _user(ADMIN_EMAIL, password, result)
    operator = _user(OPERATOR_EMAIL, password, result)
    client = _user(CLIENT_EMAIL, password, result)

    admin_membership, _ = TenantMembership.objects.get_or_create(
        tenant=tenant,
        user=admin,
        defaults={
            "role": TenantRole.ADMIN,
            "organization_access": OrganizationAccess.SELECTED,
            "default_organization_role": OrganizationRole.ADMIN,
        },
    )
    if admin_membership.organization_access == OrganizationAccess.SELECTED:
        TenantOrganizationAccess.objects.get_or_create(
            membership=admin_membership,
            organization=internal,
        )
    TenantMembership.objects.get_or_create(
        tenant=tenant,
        user=operator,
        defaults={
            "role": TenantRole.MEMBER,
            "organization_access": OrganizationAccess.ALL,
            "default_organization_role": OrganizationRole.OPERATOR,
        },
    )
    PermissionOverride.objects.get_or_create(
        organization=customer,
        user=operator,
        permission=Permission.VIEW_NETWORKS,
        defaults={"effect": Effect.DENY},
    )
    OrganizationMembership.objects.get_or_create(
        organization=customer,
        user=client,
        defaults={"role": OrganizationRole.VIEWER},
    )

    if not result.created_users:
        result.generated_password = None  # nothing used it
    return result
