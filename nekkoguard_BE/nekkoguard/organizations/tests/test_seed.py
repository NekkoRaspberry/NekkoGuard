"""Demo seed: counts, permission scenarios, idempotency, safety."""

from __future__ import annotations

from io import StringIO

import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import override_settings

from nekkoguard.organizations import access
from nekkoguard.organizations import demo
from nekkoguard.organizations.access import Source
from nekkoguard.organizations.models import Network
from nekkoguard.organizations.models import Organization
from nekkoguard.organizations.models import OrganizationMembership
from nekkoguard.organizations.models import PermissionOverride
from nekkoguard.organizations.models import Site
from nekkoguard.organizations.models import Tenant
from nekkoguard.organizations.models import TenantMembership
from nekkoguard.organizations.roles import Permission
from nekkoguard.organizations.roles import TenantPermission
from nekkoguard.users.tests.factories import UserFactory

from .factories import TenantFactory

pytestmark = pytest.mark.django_db
User = get_user_model()


def counts() -> dict[str, int]:
    models = [
        Tenant,
        Organization,
        Site,
        Network,
        TenantMembership,
        OrganizationMembership,
        PermissionOverride,
    ]
    return {m.__name__: m.objects.count() for m in models} | {
        "demo_users": User.objects.filter(email__in=demo.DEMO_EMAILS).count(),
    }


def users():
    return {u.email: u for u in User.objects.filter(email__in=demo.DEMO_EMAILS)}


def org(name: str) -> Organization:
    return Organization.objects.get(name=name)


def test_empty_database_gets_the_demo_environment():
    result = demo.seed_demo(password="dev-only-test-password")  # noqa: S106
    assert counts() == {
        "Tenant": 1,
        "Organization": 2,
        "Site": 3,
        "Network": 5,
        "TenantMembership": 2,
        "OrganizationMembership": 1,
        "PermissionOverride": 1,
        "demo_users": 3,
    }
    assert sorted(result.created_users) == sorted(demo.DEMO_EMAILS)
    assert result.generated_password is None


def test_demo_users_get_no_automatic_administration():
    demo.seed_demo(password="x-dev-only")  # noqa: S106
    assert not User.objects.filter(
        email__in=demo.DEMO_EMAILS,
        is_staff=True,
    ).exists()
    assert not User.objects.filter(
        email__in=demo.DEMO_EMAILS,
        is_superuser=True,
    ).exists()


def test_demo_permission_scenarios():
    demo.seed_demo(password="x-dev-only")  # noqa: S106
    u = users()
    tenant = Tenant.objects.get()
    internal, customer = org("NekkoGuard Internal"), org("Demo Customer")

    admin = u[demo.ADMIN_EMAIL]
    assert access.get_tenant_access(admin, tenant).can(TenantPermission.MANAGE_MEMBERS)
    assert access.get_organization_access(admin, internal) is not None  # selected
    assert access.get_organization_access(admin, customer) is None  # not selected

    operator = u[demo.OPERATOR_EMAIL]
    in_internal = access.get_organization_access(operator, internal)
    in_customer = access.get_organization_access(operator, customer)
    assert in_internal.membership is None  # inherited, no direct membership
    assert in_internal.can(Permission.VIEW_NETWORKS)
    assert not in_customer.can(Permission.VIEW_NETWORKS)  # override
    assert in_customer.decisions[Permission.VIEW_NETWORKS].source == Source.OVERRIDE
    assert in_customer.can(Permission.VIEW_SITES)

    client = u[demo.CLIENT_EMAIL]
    assert access.get_tenant_access(client, tenant) is None
    assert access.get_organization_access(client, internal) is None
    assert access.get_organization_access(client, customer).can(
        Permission.VIEW_SITES,
    )


def test_seed_is_idempotent():
    demo.seed_demo(password="x-dev-only")  # noqa: S106
    before = counts()
    second = demo.seed_demo(password="x-dev-only")  # noqa: S106
    assert counts() == before
    assert second.created_users == []
    assert second.generated_password is None


def test_existing_users_are_never_changed():
    existing = UserFactory(email=demo.OPERATOR_EMAIL, password="their-own")  # noqa: S106
    demo.seed_demo(password="x-dev-only")  # noqa: S106
    existing.refresh_from_db()
    assert existing.check_password("their-own")


def test_generated_password_when_none_given():
    result = demo.seed_demo()
    assert result.generated_password
    user = users()[demo.ADMIN_EMAIL]
    assert user.check_password(result.generated_password)


def test_if_empty_skips_when_tenants_exist():
    TenantFactory()
    result = demo.seed_demo(if_empty=True)
    assert result.skipped
    assert counts()["demo_users"] == 0


@override_settings(DEBUG=False)
def test_command_refuses_without_debug():
    with pytest.raises(CommandError):
        call_command("seed_demo")
    assert counts()["Tenant"] == 0


@override_settings(DEBUG=True)
def test_command_runs_in_debug(monkeypatch):
    monkeypatch.setenv("NEKKOGUARD_DEMO_PASSWORD", "x-dev-only")
    out = StringIO()
    call_command("seed_demo", "--if-empty", stdout=out)
    assert "Demo environment is ready" in out.getvalue()
    assert "Generated password" not in out.getvalue()
    assert counts()["demo_users"] == len(demo.DEMO_EMAILS)
