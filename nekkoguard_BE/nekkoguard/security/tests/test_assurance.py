# ruff: noqa: PLR2004 - HTTP status codes; long request lines stay readable
"""
Authentication assurance: Tenant administration (and platform-level / superuser
blanket rights) need a request that passed MFA — a browser session with a second-
factor step. MFA merely enabled on the account is not enough, and API tokens never
qualify. Without it an Administrator has exactly the rights of a Tenant Member.
"""

import pytest
from allauth.mfa.models import Authenticator
from django.test import Client
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from nekkoguard.conftest import TEST_PASSWORD
from nekkoguard.conftest import enable_totp
from nekkoguard.conftest import sign_in
from nekkoguard.conftest import totp_code
from nekkoguard.conftest import verified_user
from nekkoguard.organizations.models import PermissionOverride
from nekkoguard.organizations.roles import OrganizationAccess
from nekkoguard.organizations.roles import OrganizationRole
from nekkoguard.organizations.roles import TenantRole
from nekkoguard.organizations.tests.factories import OrganizationFactory
from nekkoguard.organizations.tests.factories import OrganizationMembershipFactory
from nekkoguard.organizations.tests.factories import SiteFactory
from nekkoguard.organizations.tests.factories import TenantFactory
from nekkoguard.organizations.tests.factories import TenantMembershipFactory
from nekkoguard.support import terms
from nekkoguard.users.tests.factories import UserFactory

pytestmark = pytest.mark.django_db

AUTH = "/_allauth/browser/v1"


@pytest.fixture
def setup():
    tenant = TenantFactory()
    organization = OrganizationFactory(tenant=tenant)
    SiteFactory(organization=organization)

    def admin(*, mfa=True):
        user = verified_user()
        if mfa:
            enable_totp(user)
        TenantMembershipFactory(
            tenant=tenant,
            user=user,
            role=TenantRole.ADMIN,
            organization_access=OrganizationAccess.ALL,
            default_organization_role=OrganizationRole.ADMIN,
        )
        return user

    return tenant, organization, admin


def token_client(user):
    client = APIClient()
    client.credentials(
        HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=user).key}",
    )
    return client


def password_only_session(user):
    """Signed in with the password only (e.g. before MFA was turned on elsewhere)."""
    client = APIClient()
    client.force_login(user)
    return client


def assert_mfa_required(response):
    assert response.status_code == 403, response.content
    assert response.json()["code"] == "mfa_required"


def tenant_row(client, tenant):
    return next(
        t for t in client.get("/api/tenants/").json() if t["id"] == str(tenant.pk)
    )


def admin_requests(tenant, organization, target):
    base = f"/api/tenants/{tenant.pk}"
    org = f"{base}/organizations/{organization.pk}"
    return [
        ("get", f"{base}/members/", None),
        ("get", f"{base}/activity/", None),
        ("patch", f"{base}/", {"description": "x"}),
        ("post", f"{base}/organizations/", {"name": "Another"}),
        ("get", f"{base}/terms/versions/", None),
        ("get", f"{base}/terms/summary/", None),
        ("get", f"{base}/terms/acceptances/", None),
        # Tenant-administrator powers inside an Organization.
        (
            "post",
            f"{org}/overrides/",
            {"user": target.pk, "permission": "sites.view", "effect": "deny"},
        ),
    ]


# ------------------------------------------------------------------- API tokens


class TestApiTokens:
    def test_token_never_unlocks_tenant_administration(self, setup):
        tenant, organization, admin = setup
        user, target = admin(), admin()
        client = token_client(user)
        for method, url, body in admin_requests(tenant, organization, target):
            assert_mfa_required(getattr(client, method)(url, body, format="json"))
        assert not PermissionOverride.objects.filter(user=target).exists()

    def test_token_cannot_publish_terms(self, setup):
        tenant, _, admin = setup
        user = admin()
        draft = terms.create_draft(actor=user, tenant=tenant)
        url = f"/api/tenants/{tenant.pk}/terms/versions/{draft.pk}/publish/"
        assert_mfa_required(token_client(user).post(url, {}, format="json"))

    def test_token_keeps_member_level_operations(self, setup):
        tenant, organization, admin = setup
        user = admin()
        client = token_client(user)
        assert client.get("/api/users/me/").status_code == 200
        row = tenant_row(client, tenant)
        assert row["permissions"] == ["tenant.view"]
        assert row["mfa_required"] is True
        # Organization-level rights (here: default organization role Admin) still work.
        sites = f"/api/tenants/{tenant.pk}/organizations/{organization.pk}/sites/"
        assert client.get(sites).status_code == 200

    def test_token_of_an_organization_admin_works_as_before(self, setup):
        """No MFA policy applies to Organization roles: tokens act like the session."""
        tenant, organization, _ = setup
        user = UserFactory()
        OrganizationMembershipFactory(
            organization=organization,
            user=user,
            role=OrganizationRole.ADMIN,
        )
        viewer = UserFactory()
        OrganizationMembershipFactory(
            organization=organization,
            user=viewer,
            role=OrganizationRole.VIEWER,
        )
        response = token_client(user).post(
            f"/api/tenants/{tenant.pk}/organizations/{organization.pk}/overrides/",
            {"user": viewer.pk, "permission": "sites.view", "effect": "deny"},
            format="json",
        )
        assert response.status_code == 201, response.content

    def test_superuser_token_reads_but_never_manages(self, setup):
        tenant, organization, _ = setup
        root = UserFactory(is_superuser=True, is_staff=True)
        enable_totp(root)
        client = token_client(root)
        org = f"/api/tenants/{tenant.pk}/organizations/{organization.pk}"
        assert client.get(f"{org}/sites/").status_code == 200
        assert_mfa_required(client.post(f"{org}/sites/", {"name": "x"}, format="json"))
        assert_mfa_required(client.get(f"/api/tenants/{tenant.pk}/members/"))
        assert_mfa_required(client.get("/api/oauth/applications/"))

    def test_platform_staff_token_cannot_change_branding(self, setup):
        tenant, _, _ = setup
        staff = UserFactory(is_staff=True)
        enable_totp(staff)
        url = f"/api/tenants/{tenant.pk}/appearance/"
        assert_mfa_required(
            token_client(staff).patch(url, {"title": "x"}, format="json"),
        )
        assert (
            sign_in(APIClient(), staff)
            .patch(url, {"title": "x"}, format="json")
            .status_code
            == 200
        )


# ------------------------------------------------------------------- sessions


class TestSessionAssurance:
    def test_mfa_on_the_account_is_not_enough_without_the_code_in_this_session(
        self,
        setup,
    ):
        tenant, organization, admin = setup
        user, target = admin(), admin()
        client = password_only_session(user)
        assert client.get("/api/users/me/").json()["mfa_required"] is True
        assert tenant_row(client, tenant)["permissions"] == ["tenant.view"]
        for method, url, body in admin_requests(tenant, organization, target):
            assert_mfa_required(getattr(client, method)(url, body, format="json"))

    def test_a_session_that_passed_mfa_administers(self, setup):
        tenant, organization, admin = setup
        user, target = admin(), admin()
        client = sign_in(APIClient(), user)
        me = client.get("/api/users/me/").json()
        assert me["mfa_required"] is False
        row = tenant_row(client, tenant)
        assert "tenant.members.manage" in row["permissions"]
        assert row["mfa_required"] is False
        for method, url, body in admin_requests(tenant, organization, target):
            response = getattr(client, method)(url, body, format="json")
            assert response.status_code < 400, (url, response.content)

    def test_real_sign_in_with_the_code(self, setup):
        tenant, _, admin = setup
        user = admin()
        client = Client()
        client.post(
            f"{AUTH}/auth/login",
            {"email": user.email, "password": TEST_PASSWORD},
            content_type="application/json",
        )
        client.post(
            f"{AUTH}/auth/2fa/authenticate",
            {"code": totp_code(user)},
            content_type="application/json",
        )
        assert client.get(f"/api/tenants/{tenant.pk}/members/").status_code == 200

    def test_confirming_the_code_upgrades_an_older_session(self, setup):
        tenant, _, admin = setup
        user = admin()
        client = password_only_session(user)
        assert_mfa_required(client.get(f"/api/tenants/{tenant.pk}/members/"))
        response = client.post(
            f"{AUTH}/auth/2fa/reauthenticate",
            {"code": totp_code(user)},
            format="json",
        )
        assert response.status_code == 200, response.content
        assert client.get(f"/api/tenants/{tenant.pk}/members/").status_code == 200

    # allauth announces the new authenticator on commit: needs real transactions.
    @pytest.mark.django_db(transaction=True)
    def test_setting_mfa_up_in_this_session_unlocks_administration(self, setup):
        tenant, _, admin = setup
        user = admin(mfa=False)
        client = Client()
        client.post(
            f"{AUTH}/auth/login",
            {"email": user.email, "password": TEST_PASSWORD},
            content_type="application/json",
        )
        assert client.get("/api/users/me/").json()["mfa_required"] is True
        client.post(
            f"{AUTH}/auth/reauthenticate",
            {"password": TEST_PASSWORD},
            content_type="application/json",
        )
        secret = client.get(f"{AUTH}/account/authenticators/totp").json()["meta"][
            "secret"
        ]

        from allauth.mfa.totp.internal.auth import format_hotp_value  # noqa: PLC0415
        from allauth.mfa.totp.internal.auth import hotp_value  # noqa: PLC0415
        from allauth.mfa.totp.internal.auth import yield_hotp_counters_from_time  # noqa: PLC0415

        code = format_hotp_value(
            hotp_value(secret, next(yield_hotp_counters_from_time())),
        )
        response = client.post(
            f"{AUTH}/account/authenticators/totp",
            {"code": code},
            content_type="application/json",
        )
        assert response.status_code == 200, response.content
        assert client.get("/api/users/me/").json()["mfa_required"] is False
        assert client.get(f"/api/tenants/{tenant.pk}/members/").status_code == 200

    def test_turning_mfa_off_brings_member_level_back(self, setup):
        tenant, _, admin = setup
        user = admin()
        client = sign_in(APIClient(), user)
        assert client.get(f"/api/tenants/{tenant.pk}/members/").status_code == 200
        Authenticator.objects.filter(user=user).delete()
        assert_mfa_required(client.get(f"/api/tenants/{tenant.pk}/members/"))
        assert tenant_row(client, tenant)["permissions"] == ["tenant.view"]

    def test_member_rights_stay_for_an_admin_without_mfa(self, setup):
        """Reading the Tenant, its Terms, and Organization-level rights keep working."""
        tenant, organization, admin = setup
        user = admin(mfa=False)
        client = sign_in(APIClient(), user)
        assert client.get(f"/api/tenants/{tenant.pk}/").status_code == 200
        response = client.get(f"/api/tenants/{tenant.pk}/terms/")
        assert response.status_code == 200
        assert response.json()["can_manage"] is False
        org = f"/api/tenants/{tenant.pk}/organizations/{organization.pk}"
        detail = client.get(f"{org}/").json()
        assert detail["can_administer"] is False
        assert detail["mfa_required"] is True
        assert client.get(f"{org}/sites/").status_code == 200

    def test_superuser_without_mfa_reads_organizations_only(self, setup):
        tenant, organization, _ = setup
        root = UserFactory(is_superuser=True, is_staff=True)
        client = sign_in(APIClient(), root)
        org = f"/api/tenants/{tenant.pk}/organizations/{organization.pk}"
        detail = client.get(f"{org}/").json()
        assert detail["mfa_required"] is True
        assert "sites.manage" not in detail["my_access"]["permissions"]
        assert "sites.view" in detail["my_access"]["permissions"]
        assert client.get(f"{org}/sites/").status_code == 200
        assert_mfa_required(client.post(f"{org}/sites/", {"name": "x"}, format="json"))

        enable_totp(root)
        client = sign_in(APIClient(), root)
        assert (
            client.post(f"{org}/sites/", {"name": "x"}, format="json").status_code
            == 201
        )
