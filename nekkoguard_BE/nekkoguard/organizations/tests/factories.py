from __future__ import annotations

from factory import LazyAttribute
from factory import Sequence
from factory import SubFactory
from factory.django import DjangoModelFactory

from nekkoguard.organizations.models import Network
from nekkoguard.organizations.models import Organization
from nekkoguard.organizations.models import OrganizationMembership
from nekkoguard.organizations.models import Site
from nekkoguard.organizations.models import Tenant
from nekkoguard.organizations.models import TenantMembership
from nekkoguard.organizations.roles import OrganizationAccess
from nekkoguard.organizations.roles import OrganizationRole
from nekkoguard.organizations.roles import TenantRole
from nekkoguard.users.tests.factories import UserFactory


class TenantFactory(DjangoModelFactory[Tenant]):
    name = Sequence(lambda n: f"Tenant {n}")

    class Meta:
        model = Tenant


class OrganizationFactory(DjangoModelFactory[Organization]):
    tenant = SubFactory(TenantFactory)
    name = Sequence(lambda n: f"Organization {n}")

    class Meta:
        model = Organization


class TenantMembershipFactory(DjangoModelFactory[TenantMembership]):
    tenant = SubFactory(TenantFactory)
    user = SubFactory(UserFactory)
    role = TenantRole.MEMBER
    organization_access = OrganizationAccess.NONE
    default_organization_role = LazyAttribute(
        lambda o: (
            ""
            if o.organization_access == OrganizationAccess.NONE
            else OrganizationRole.VIEWER
        ),
    )

    class Meta:
        model = TenantMembership


class OrganizationMembershipFactory(DjangoModelFactory[OrganizationMembership]):
    organization = SubFactory(OrganizationFactory)
    user = SubFactory(UserFactory)
    role = OrganizationRole.VIEWER

    class Meta:
        model = OrganizationMembership


class SiteFactory(DjangoModelFactory[Site]):
    organization = SubFactory(OrganizationFactory)
    name = Sequence(lambda n: f"Site {n}")

    class Meta:
        model = Site


class NetworkFactory(DjangoModelFactory[Network]):
    site = SubFactory(SiteFactory)
    name = Sequence(lambda n: f"Network {n}")

    class Meta:
        model = Network
