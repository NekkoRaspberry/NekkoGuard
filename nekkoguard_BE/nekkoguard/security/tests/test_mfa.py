# ruff: noqa: PLR2004, E501 - HTTP status codes
"""Tenant administration requires MFA (superusers included); normal use does not."""

import pytest
from allauth.mfa.models import Authenticator
from rest_framework.test import APIClient

from nekkoguard.conftest import enable_totp
from nekkoguard.conftest import sign_in
from nekkoguard.organizations.models import PermissionOverride
from nekkoguard.organizations.roles import OrganizationAccess
from nekkoguard.organizations.roles import OrganizationRole
from nekkoguard.organizations.roles import TenantRole
from nekkoguard.organizations.tests.factories import OrganizationFactory
from nekkoguard.organizations.tests.factories import OrganizationMembershipFactory
from nekkoguard.organizations.tests.factories import TenantFactory
from nekkoguard.organizations.tests.factories import TenantMembershipFactory
from nekkoguard.users.tests.factories import UserFactory

pytestmark = pytest.mark.django_db


def client_for(user):
    client = APIClient()
    sign_in(client, user)
    return client


def make_admin(tenant, *, mfa, **extra):
    user = UserFactory()
    if mfa:
        enable_totp(user)
    TenantMembershipFactory(
        tenant=tenant,
        user=user,
        role=TenantRole.ADMIN,
        organization_access=OrganizationAccess.ALL,
        default_organization_role=OrganizationRole.ADMIN,
        **extra,
    )
    return user


def assert_mfa_required(response):
    assert response.status_code == 403
    assert response.json()["code"] == "mfa_required"
    assert "Security" in response.json()["detail"]


def admin_endpoints(tenant):
    """Requests that only Tenant administration can make."""
    base = f"/api/tenants/{tenant.pk}"
    return [
        ("get", f"{base}/members/", None),
        ("get", f"{base}/activity/", None),
        ("patch", f"{base}/", {"description": "x"}),
        ("post", f"{base}/organizations/", {"name": "New org"}),
        ("patch", f"{base}/appearance/", {"title": "Brand"}),
        ("get", f"{base}/terms/versions/", None),
        ("get", f"{base}/terms/summary/", None),
    ]


def test_tenant_admin_without_mfa_cannot_administer_through_the_api():
    tenant = TenantFactory()
    client = client_for(make_admin(tenant, mfa=False))
    for method, url, body in admin_endpoints(tenant):
        assert_mfa_required(getattr(client, method)(url, body, format="json"))


def test_tenant_admin_with_mfa_can():
    tenant = TenantFactory()
    client = client_for(make_admin(tenant, mfa=True))
    for method, url, body in admin_endpoints(tenant):
        response = getattr(client, method)(url, body, format="json")
        assert response.status_code < 400, (url, response.content)


def test_the_user_api_tells_the_frontend():
    tenant = TenantFactory()
    admin = make_admin(tenant, mfa=False)
    me = client_for(admin).get("/api/users/me/").json()
    assert (me["mfa_enabled"], me["mfa_required"]) == (False, True)
    enable_totp(admin)
    me = client_for(admin).get("/api/users/me/").json()
    assert (me["mfa_enabled"], me["mfa_required"]) == (True, False)


def test_normal_use_keeps_working_without_mfa():
    tenant = TenantFactory()
    org = OrganizationFactory(tenant=tenant)
    admin = make_admin(tenant, mfa=False)
    client = client_for(admin)
    base = f"/api/tenants/{tenant.pk}/organizations/{org.pk}"
    # Organization rights (here through the default organization role) need no MFA.
    assert client.get(f"{base}/sites/").status_code == 200
    assert (
        client.post(f"{base}/sites/", {"name": "HQ"}, format="json").status_code == 201
    )
    assert client.get(f"/api/tenants/{tenant.pk}/").status_code == 200
    assert client.get(f"/api/tenants/{tenant.pk}/terms/").status_code == 200
    # Members and organization administrators are never asked for MFA.
    member = UserFactory()
    TenantMembershipFactory(
        tenant=tenant,
        user=member,
        organization_access=OrganizationAccess.ALL,
        default_organization_role=OrganizationRole.VIEWER,
    )
    org_admin = UserFactory()
    OrganizationMembershipFactory(
        organization=org,
        user=org_admin,
        role=OrganizationRole.ADMIN,
    )
    for user in (member, org_admin):
        assert client_for(user).get(f"{base}/members/").status_code == 200
        assert client_for(user).get("/api/users/me/").json()["mfa_required"] is False
    assert (
        client_for(org_admin)
        .patch(f"{base}/", {"description": "x"}, format="json")
        .status_code
        == 200
    )


def test_admin_in_one_tenant_member_in_another():
    tenant_a, tenant_b = TenantFactory(), TenantFactory()
    user = make_admin(tenant_a, mfa=False)
    TenantMembershipFactory(tenant=tenant_b, user=user)
    client = client_for(user)
    assert_mfa_required(client.get(f"/api/tenants/{tenant_a.pk}/members/"))
    # Tenant B: an ordinary member, unaffected (403 because members don't manage members).
    response = client.get(f"/api/tenants/{tenant_b.pk}/members/")
    assert response.status_code == 403
    assert response.json().get("code") != "mfa_required"
    assert client.get(f"/api/tenants/{tenant_b.pk}/").status_code == 200


def test_losing_admin_status_or_suspension_lifts_the_requirement():
    tenant = TenantFactory()
    user = make_admin(tenant, mfa=False)
    membership = user.tenant_memberships.get()
    membership.role = TenantRole.MEMBER
    membership.save()
    assert client_for(user).get("/api/users/me/").json()["mfa_required"] is False
    membership.role, membership.status = TenantRole.ADMIN, "suspended"
    membership.save()
    assert client_for(user).get("/api/users/me/").json()["mfa_required"] is False


def test_removing_mfa_brings_the_requirement_back():
    tenant = TenantFactory()
    admin = make_admin(tenant, mfa=True)
    client = client_for(admin)
    assert client.get(f"/api/tenants/{tenant.pk}/members/").status_code == 200
    Authenticator.objects.filter(user=admin).delete()
    assert_mfa_required(client.get(f"/api/tenants/{tenant.pk}/members/"))


def test_superusers_need_mfa_for_tenant_administration():
    tenant = TenantFactory()
    root = UserFactory(is_superuser=True, is_staff=True)
    client = client_for(root)
    assert client.get("/api/users/me/").json()["mfa_required"] is True
    assert_mfa_required(client.get(f"/api/tenants/{tenant.pk}/members/"))
    enable_totp(root)
    # MFA on the account is not enough: this session has not passed it.
    assert_mfa_required(client.get(f"/api/tenants/{tenant.pk}/members/"))
    client = client_for(root)  # signs in again, now with the code
    assert client.get(f"/api/tenants/{tenant.pk}/members/").status_code == 200


def test_mfa_setup_and_sign_out_stay_reachable():
    tenant = TenantFactory()
    client = client_for(make_admin(tenant, mfa=False))
    # allauth account endpoints (where MFA is set up) are never blocked.
    assert client.get("/_allauth/browser/v1/account/authenticators").status_code == 200
    assert client.get("/api/users/me/").status_code == 200
    assert client.delete("/_allauth/browser/v1/auth/session").status_code in (200, 401)


def org_url(tenant, organization, path):
    return f"/api/tenants/{tenant.pk}/organizations/{organization.pk}/{path}"


def test_tenant_admin_powers_inside_an_organization_need_mfa():
    """Changing another tenant administrator's access is Tenant administration."""
    tenant = TenantFactory()
    organization = OrganizationFactory(tenant=tenant)
    actor = make_admin(tenant, mfa=False)
    target = make_admin(tenant, mfa=True)
    client = client_for(actor)
    deny = {"user": target.pk, "permission": "sites.view", "effect": "deny"}

    assert_mfa_required(
        client.post(org_url(tenant, organization, "overrides/"), deny, format="json"),
    )
    assert not PermissionOverride.objects.filter(user=target).exists()

    enable_totp(actor)
    client = client_for(actor)  # sign in again with the second factor
    response = client.post(
        org_url(tenant, organization, "overrides/"),
        deny,
        format="json",
    )
    assert response.status_code == 201, response.content


def test_tenant_admin_without_mfa_keeps_normal_organization_rights():
    """Without MFA a tenant admin still manages ordinary members as an org admin."""
    tenant = TenantFactory()
    organization = OrganizationFactory(tenant=tenant)
    actor = make_admin(tenant, mfa=False)
    member = UserFactory()
    OrganizationMembershipFactory(
        organization=organization,
        user=member,
        role=OrganizationRole.VIEWER,
    )
    client = client_for(actor)
    response = client.post(
        org_url(tenant, organization, "overrides/"),
        {"user": member.pk, "permission": "sites.view", "effect": "deny"},
        format="json",
    )
    assert response.status_code == 201, response.content
