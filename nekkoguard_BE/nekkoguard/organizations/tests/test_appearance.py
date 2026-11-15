"""White-label appearance: inheritance, Appearance Admin rights, isolation, uploads."""

from __future__ import annotations

import io

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError
from django.db import transaction
from PIL import Image
from rest_framework import status

from nekkoguard.organizations import appearance
from nekkoguard.organizations.models import ActivityEntry
from nekkoguard.organizations.models import MembershipStatus
from nekkoguard.organizations.models import OrganizationAppearance
from nekkoguard.organizations.models import PermissionOverride
from nekkoguard.organizations.models import TenantAppearance
from nekkoguard.organizations.roles import Effect
from nekkoguard.organizations.roles import OrganizationRole
from nekkoguard.organizations.roles import Permission
from nekkoguard.users.tests.factories import UserFactory

from .conftest import api_client
from .factories import OrganizationMembershipFactory

pytestmark = pytest.mark.django_db

HASH_LENGTH = 16


def t_url(tenant, suffix=""):
    return f"/api/tenants/{tenant.pk}/appearance/{suffix}"


def o_url(org, suffix="", tenant=None):
    tenant = tenant or org.tenant
    return f"/api/tenants/{tenant.pk}/organizations/{org.pk}/appearance/{suffix}"


def png_bytes(size=(40, 20), fmt="PNG", color=(124, 108, 246, 255)):
    buffer = io.BytesIO()
    mode = "RGB" if fmt == "JPEG" else "RGBA"
    Image.new(mode, size, color[:3] if mode == "RGB" else color).save(buffer, fmt)
    return buffer.getvalue()


def upload(name="logo.png", data=None, content_type="image/png"):
    return SimpleUploadedFile(
        name,
        png_bytes() if data is None else data,
        content_type=content_type,
    )


@pytest.fixture
def org_admin(world):
    """Organization Administrator of A2 through a direct membership only."""
    user = UserFactory(email="orgadmin@example.test")
    OrganizationMembershipFactory(
        organization=world.a2,
        user=user,
        role=OrganizationRole.ADMIN,
    )
    return user


# ---------------------------------------------------------------- pure resolution


class TestResolve:
    def test_nothing_configured_means_defaults(self):
        resolved = appearance.resolve(None, None)
        assert set(resolved.values.values()) == {None}
        assert set(resolved.sources.values()) == {"default"}
        assert resolved.assets["logo"].source == "default"

    def test_organization_overrides_tenant_property_by_property(self):
        tenant = TenantAppearance(primary_color="#111111", title="Acme")
        org = OrganizationAppearance(primary_color="#222222")
        resolved = appearance.resolve(tenant, org)
        assert resolved.values["primary_color"] == "#222222"
        assert resolved.sources["primary_color"] == "organization"
        assert resolved.values["title"] == "Acme"
        assert resolved.sources["title"] == "tenant"
        assert resolved.values["accent_color"] is None
        assert resolved.sources["accent_color"] == "default"

    def test_assets_inherit_independently(self):
        tenant = TenantAppearance(logo=b"t", logo_hash="t" * 16)
        org = OrganizationAppearance(favicon=b"o", favicon_hash="o" * 16)
        resolved = appearance.resolve(tenant, org)
        assert resolved.assets["logo"] == appearance.AssetRef("tenant", "t" * 16)
        assert resolved.assets["favicon"] == appearance.AssetRef(
            "organization",
            "o" * 16,
        )


class TestCleanValues:
    @pytest.mark.parametrize(
        ("value", "expected"),
        [
            ("#7C6CF6", "#7c6cf6"),
            ("#abc", "#aabbcc"),
            ("rgb(124, 108, 246)", "#7c6cf6"),
            (" #000000 ", "#000000"),
        ],
    )
    def test_colors_are_normalized(self, value, expected):
        assert appearance.clean_values({"primary_color": value}) == {
            "primary_color": expected,
        }

    @pytest.mark.parametrize(
        "value",
        ["red", "#12345", "#gggggg", "rgb(300,0,0)", "url(x)", "var(--x)", 12, ""],
    )
    def test_invalid_colors_are_rejected(self, value):
        with pytest.raises(appearance.ValidationError):
            appearance.clean_values({"primary_color": value})

    def test_none_resets(self):
        assert appearance.clean_values({"title": None}) == {"title": None}

    @pytest.mark.parametrize(
        "data",
        [
            {"navbar_position": "bottom"},
            {"title": "   "},
            {"title": "x" * 61},
            {"title": "bad\x00title"},
            {"custom_css": "body{}"},
            ["not", "an", "object"],
        ],
    )
    def test_invalid_payloads(self, data):
        with pytest.raises(appearance.ValidationError):
            appearance.clean_values(data)


def test_database_rejects_invalid_values(world):
    with transaction.atomic(), pytest.raises(IntegrityError):
        TenantAppearance.objects.create(tenant=world.tenant_a, primary_color="red")
    with transaction.atomic(), pytest.raises(IntegrityError):
        TenantAppearance.objects.create(tenant=world.tenant_a, navbar_position="bottom")
    with transaction.atomic(), pytest.raises(IntegrityError):
        TenantAppearance.objects.create(tenant=world.tenant_a, title="")


# ---------------------------------------------------------------- reading


class TestRead:
    def test_uncustomized_scope_returns_only_defaults(self, world):
        response = world.client("carl").get(o_url(world.a1))
        assert response.status_code == status.HTTP_200_OK
        assert set(response.data["sources"].values()) == {"default"}
        assert response.data["effective"]["logo_url"] is None
        assert response.data["can_manage"] is False

    def test_members_read_their_effective_appearance(self, world):
        assert (
            world.client("carl").get(t_url(world.tenant_a)).status_code
            == status.HTTP_200_OK
        )
        # peter only reaches A2 (no Tenant membership) and still inherits the Tenant.
        assert (
            world.client("peter").get(o_url(world.a2)).status_code == status.HTTP_200_OK
        )
        assert (
            world.client("peter").get(t_url(world.tenant_a)).status_code
            == status.HTTP_200_OK
        )

    @pytest.mark.parametrize("name", ["outsider", "b_admin"])
    def test_outsiders_get_404(self, world, name):
        client = world.client(name)
        assert (
            client.get(t_url(world.tenant_a)).status_code == status.HTTP_404_NOT_FOUND
        )
        assert client.get(o_url(world.a1)).status_code == status.HTTP_404_NOT_FOUND

    def test_organization_outside_url_tenant_is_not_found(self, world):
        response = world.client("ada").get(o_url(world.b1, tenant=world.tenant_a))
        assert response.status_code == status.HTTP_404_NOT_FOUND
        response = world.client("ada").patch(
            o_url(world.b1, tenant=world.tenant_a),
            {"title": "x"},
            format="json",
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_user_without_access_to_organization_gets_404(self, world):
        # mary reaches A1 only.
        assert (
            world.client("mary").get(o_url(world.a2)).status_code
            == status.HTTP_404_NOT_FOUND
        )

    def test_anonymous_is_rejected(self, world):
        assert api_client().get(t_url(world.tenant_a)).status_code in {401, 403}


# ---------------------------------------------------------------- Appearance Admin


class TestTenantAppearanceAdmin:
    def test_tenant_admin_customizes_tenant(self, world):
        response = world.client("john").patch(
            t_url(world.tenant_a),
            {"title": "Acme Guard", "primary_color": "#FF0000"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["configured"]["primary_color"] == "#ff0000"
        assert response.data["effective"]["title"] == "Acme Guard"
        assert response.data["sources"]["title"] == "tenant"
        assert response.data["can_manage"] is True

    def test_tenant_member_cannot_customize_tenant(self, world):
        response = world.client("carl").patch(
            t_url(world.tenant_a),
            {"primary_color": "not-a-color"},  # permission is checked first: 403
            format="json",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert not TenantAppearance.objects.exists()

    def test_tenant_admin_of_other_tenant_is_isolated(self, world):
        # sarah administers Tenant B but is only a member of Tenant A.
        client = world.client("sarah")
        assert (
            client.patch(
                t_url(world.tenant_b),
                {"title": "B"},
                format="json",
            ).status_code
            == status.HTTP_200_OK
        )
        assert (
            client.patch(
                t_url(world.tenant_a),
                {"title": "A"},
                format="json",
            ).status_code
            == status.HTTP_403_FORBIDDEN
        )
        assert (
            client.patch(o_url(world.a1), {"title": "A"}, format="json").status_code
            == status.HTTP_403_FORBIDDEN
        )
        assert not TenantAppearance.objects.filter(tenant=world.tenant_a).exists()

    def test_tenant_appearance_admin_customizes_its_organizations(self, world):
        # john administers Tenant A but reaches no Organization.
        client = world.client("john")
        response = client.patch(
            o_url(world.a1),
            {"accent_color": "#00ff00"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["sources"]["accent_color"] == "organization"

    def test_appearance_admin_gains_no_infrastructure_rights(self, world):
        # john is a Viewer of the infrastructure: branding rights add nothing to it.
        client = world.client("john")
        client.patch(o_url(world.a1), {"title": "Branded"}, format="json")
        base = f"/api/tenants/{world.tenant_a.pk}/organizations/{world.a1.pk}"
        response = client.post(f"{base}/sites/", {"name": "New"}, format="json")
        assert response.status_code in {403, 404}

    def test_scoped_admin_brands_only_selected_organizations(
        self,
        world,
        scoped_admin,
    ):
        client = api_client(scoped_admin)
        ok = client.patch(o_url(world.a1), {"title": "A1 brand"}, format="json")
        assert ok.status_code == status.HTTP_200_OK
        outside = client.patch(o_url(world.a2), {"title": "A2 brand"}, format="json")
        assert outside.status_code == status.HTTP_404_NOT_FOUND
        # The tenant-wide default is not tied to one organization: allowed.
        tenant_url = f"/api/tenants/{world.tenant_a.pk}/appearance/"
        tenant = client.patch(tenant_url, {"title": "Tenant"}, format="json")
        assert tenant.status_code == status.HTTP_200_OK


class TestOrganizationAppearanceAdmin:
    def test_organization_admin_customizes_own_organization(self, world, org_admin):
        client = api_client(org_admin)
        response = client.patch(
            o_url(world.a2),
            {"navbar_position": "top"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["effective"]["navbar_position"] == "top"

    def test_organization_admin_cannot_touch_tenant_or_other_orgs(
        self,
        world,
        org_admin,
    ):
        client = api_client(org_admin)
        assert (
            client.patch(
                t_url(world.tenant_a),
                {"title": "x"},
                format="json",
            ).status_code
            == status.HTTP_403_FORBIDDEN
        )
        assert (
            client.patch(o_url(world.a1), {"title": "x"}, format="json").status_code
            == status.HTTP_404_NOT_FOUND
        )
        assert (
            client.patch(o_url(world.b1), {"title": "x"}, format="json").status_code
            == status.HTTP_404_NOT_FOUND
        )

    def test_operator_cannot_customize(self, world):
        response = world.client("carl").patch(
            o_url(world.a1),
            {"title": "x"},
            format="json",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_inherited_tenant_role_grants_organization_appearance(self, world):
        # The Tenant owner reaches every Organization as Organization owner.
        response = world.client("ada").patch(
            o_url(world.a1),
            {"title": "x"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK

    def test_override_grants_appearance_admin_to_a_viewer(self, world):
        PermissionOverride.objects.create(
            organization=world.a2,
            user=world.peter,
            permission=Permission.MANAGE_APPEARANCE,
            effect=Effect.GRANT,
        )
        client = world.client("peter")
        assert (
            client.patch(o_url(world.a2), {"title": "x"}, format="json").status_code
            == status.HTTP_200_OK
        )
        # …and still nothing more than a viewer elsewhere.
        assert (
            client.patch(
                t_url(world.tenant_a),
                {"title": "x"},
                format="json",
            ).status_code
            == status.HTTP_403_FORBIDDEN
        )

    def test_override_deny_removes_appearance_admin(self, world, org_admin):
        PermissionOverride.objects.create(
            organization=world.a2,
            user=org_admin,
            permission=Permission.MANAGE_APPEARANCE,
            effect=Effect.DENY,
        )
        response = api_client(org_admin).patch(
            o_url(world.a2),
            {"title": "x"},
            format="json",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_suspended_membership_cannot_customize(self, world, org_admin):
        org_admin.organization_memberships.update(status=MembershipStatus.SUSPENDED)
        response = api_client(org_admin).patch(
            o_url(world.a2),
            {"title": "x"},
            format="json",
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_suspended_tenant_admin_cannot_customize(self, world):
        world.john.tenant_memberships.update(status=MembershipStatus.SUSPENDED)
        client = world.client("john")
        assert (
            client.patch(
                t_url(world.tenant_a),
                {"title": "x"},
                format="json",
            ).status_code
            == status.HTTP_404_NOT_FOUND
        )
        assert (
            client.patch(o_url(world.a1), {"title": "x"}, format="json").status_code
            == status.HTTP_404_NOT_FOUND
        )


class TestPlatformAdmin:
    def test_platform_admin_customizes_any_tenant_and_organization(
        self,
        world,
        platform_admin,
    ):
        client = api_client(platform_admin)
        assert (
            client.patch(
                t_url(world.tenant_b),
                {"title": "B"},
                format="json",
            ).status_code
            == status.HTTP_200_OK
        )
        assert (
            client.patch(o_url(world.a1), {"title": "A1"}, format="json").status_code
            == status.HTTP_200_OK
        )

    def test_platform_admin_gains_no_infrastructure_access(self, world, platform_admin):
        base = f"/api/tenants/{world.tenant_a.pk}/organizations/{world.a1.pk}"
        assert (
            api_client(platform_admin).get(f"{base}/sites/").status_code
            == status.HTTP_404_NOT_FOUND
        )


# ---------------------------------------------------------------- API inheritance


class TestInheritance:
    def test_partial_overrides_and_reset(self, world):
        owner = world.client("ada")
        owner.patch(
            t_url(world.tenant_a),
            {"title": "Acme", "primary_color": "#111111", "navbar_position": "top"},
            format="json",
        )
        owner.patch(o_url(world.a1), {"primary_color": "#222222"}, format="json")

        data = world.client("carl").get(o_url(world.a1)).data
        assert data["effective"]["primary_color"] == "#222222"
        assert data["sources"]["primary_color"] == "organization"
        assert data["effective"]["title"] == "Acme"
        assert data["sources"]["title"] == "tenant"
        assert data["sources"]["accent_color"] == "default"
        assert data["inherited"]["primary_color"] == "#111111"
        # Nothing set on A2, so it shows the Tenant values.
        a2 = world.client("ada").get(o_url(world.a2)).data
        assert a2["effective"]["primary_color"] == "#111111"

        # Resetting one property restores inheritance.
        data = owner.patch(o_url(world.a1), {"primary_color": None}, format="json").data
        assert data["effective"]["primary_color"] == "#111111"
        assert data["sources"]["primary_color"] == "tenant"

    def test_reset_all(self, world):
        owner = world.client("ada")
        owner.patch(t_url(world.tenant_a), {"title": "Acme"}, format="json")
        owner.patch(
            o_url(world.a1),
            {"title": "A1", "accent_color": "#123456"},
            format="json",
        )
        data = owner.delete(o_url(world.a1)).data
        assert data["effective"]["title"] == "Acme"
        assert data["sources"]["accent_color"] == "default"
        assert not OrganizationAppearance.objects.filter(organization=world.a1).exists()
        assert ActivityEntry.objects.filter(action="appearance.reset").exists()

    def test_tenant_customization_never_reaches_other_tenant(self, world):
        world.client("ada").patch(
            t_url(world.tenant_a),
            {"title": "Acme"},
            format="json",
        )
        data = world.client("b_admin").get(o_url(world.b1)).data
        assert data["effective"]["title"] is None


# ---------------------------------------------------------------- validation + audit


def test_invalid_values_are_rejected(world):
    client = world.client("ada")
    for payload in (
        {"primary_color": "javascript:alert(1)"},
        {"navbar_position": "bottom"},
        {"css": "body{display:none}"},
    ):
        response = client.patch(t_url(world.tenant_a), payload, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST


def test_changes_are_audited(world):
    world.client("john").patch(
        o_url(world.a1),
        {"primary_color": "#ff0000"},
        format="json",
    )
    entry = ActivityEntry.objects.get(action="appearance.updated")
    assert entry.actor == world.john
    assert entry.tenant == world.tenant_a
    assert entry.organization == world.a1
    assert entry.details["scope"] == "organization"
    assert entry.details["changes"] == {"primary_color": [None, "#ff0000"]}
    assert entry.created_at is not None


def test_unchanged_values_are_not_audited(world):
    client = world.client("ada")
    client.patch(t_url(world.tenant_a), {"title": "Acme"}, format="json")
    client.patch(t_url(world.tenant_a), {"title": "Acme"}, format="json")
    assert ActivityEntry.objects.filter(action="appearance.updated").count() == 1


# ---------------------------------------------------------------- images


class TestAssets:
    def test_upload_serve_and_inherit_logo(self, world):
        client = world.client("ada")
        response = client.put(
            t_url(world.tenant_a, "logo/"),
            {"file": upload()},
            format="multipart",
        )
        assert response.status_code == status.HTTP_200_OK
        digest = response.data["hash"]

        data = world.client("carl").get(o_url(world.a1)).data
        assert data["sources"]["logo"] == "tenant"
        assert data["effective"]["logo_url"].endswith(f"/logo/?v={digest}")

        image = world.client("carl").get(o_url(world.a1, "logo/"))
        assert image.status_code == status.HTTP_200_OK
        assert image["Content-Type"] == "image/png"
        assert image["X-Content-Type-Options"] == "nosniff"
        assert "sandbox" in image["Content-Security-Policy"]
        assert Image.open(io.BytesIO(image.content)).format == "PNG"

    def test_organization_logo_overrides_and_removal_restores(self, world):
        client = world.client("ada")
        client.put(
            t_url(world.tenant_a, "logo/"),
            {"file": upload()},
            format="multipart",
        )
        client.put(
            o_url(world.a1, "logo/"),
            {"file": upload("o.webp", png_bytes(fmt="WEBP"), "image/webp")},
            format="multipart",
        )
        data = client.get(o_url(world.a1)).data
        assert data["sources"]["logo"] == "organization"
        # The settings page previews what a removal would fall back to.
        assert data["inherited"]["logo_url"].startswith(t_url(world.tenant_a, "logo/"))
        assert client.delete(o_url(world.a1, "logo/")).status_code == status.HTTP_200_OK
        assert client.get(o_url(world.a1)).data["sources"]["logo"] == "tenant"

    def test_logo_is_resized_without_distortion(self, world):
        client = world.client("ada")
        big = png_bytes(size=(2000, 1000))
        client.put(
            t_url(world.tenant_a, "logo/"),
            {"file": upload(data=big)},
            format="multipart",
        )
        served = Image.open(
            io.BytesIO(client.get(t_url(world.tenant_a, "logo/")).content),
        )
        assert served.size == (512, 256)

    def test_favicon_is_square(self, world):
        client = world.client("ada")
        client.put(
            t_url(world.tenant_a, "favicon/"),
            {
                "file": upload(
                    "f.jpg",
                    png_bytes(size=(100, 50), fmt="JPEG"),
                    "image/jpeg",
                ),
            },
            format="multipart",
        )
        served = Image.open(
            io.BytesIO(client.get(t_url(world.tenant_a, "favicon/")).content),
        )
        assert served.size == (64, 64)

    @pytest.mark.parametrize(
        ("name", "data", "content_type"),
        [
            ("logo.svg", b"<svg onload='alert(1)'/>", "image/svg+xml"),
            ("logo.png", b"<svg onload='alert(1)'/>", "image/png"),
            ("logo.png", b"GIF89a not really", "image/png"),
            ("logo.jpg", None, "image/jpeg"),  # PNG content behind a .jpg name
            ("logo.png", None, "text/html"),
            ("logo.gif", None, "image/gif"),
            ("logo", None, "image/png"),
        ],
    )
    def test_unsafe_or_mismatched_uploads_are_rejected(
        self,
        world,
        name,
        data,
        content_type,
    ):
        response = world.client("ada").put(
            t_url(world.tenant_a, "logo/"),
            {"file": upload(name, data, content_type)},
            format="multipart",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert not TenantAppearance.objects.filter(logo_hash__isnull=False).exists()

    def test_oversized_upload_is_rejected(self, world):
        data = png_bytes() + b"\0" * appearance.MAX_UPLOAD_BYTES
        response = world.client("ada").put(
            t_url(world.tenant_a, "logo/"),
            {"file": upload(data=data)},
            format="multipart",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_oversized_body_is_refused_before_parsing(self, world):
        data = b"\0" * (appearance.MAX_UPLOAD_BYTES + 128 * 1024)
        response = world.client("ada").put(
            t_url(world.tenant_a, "logo/"),
            {"file": upload(data=data)},
            format="multipart",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "1 MB" in str(response.data["file"][0])

    def test_missing_file(self, world):
        response = world.client("ada").put(
            t_url(world.tenant_a, "logo/"),
            {},
            format="multipart",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_non_admin_cannot_upload(self, world):
        response = world.client("carl").put(
            o_url(world.a1, "logo/"),
            {"file": upload()},
            format="multipart",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_outsider_cannot_fetch_images(self, world):
        world.client("ada").put(
            t_url(world.tenant_a, "logo/"),
            {"file": upload()},
            format="multipart",
        )
        assert (
            world.client("b_admin").get(t_url(world.tenant_a, "logo/")).status_code
            == status.HTTP_404_NOT_FOUND
        )

    def test_missing_image_is_404(self, world):
        assert (
            world.client("ada").get(t_url(world.tenant_a, "logo/")).status_code
            == status.HTTP_404_NOT_FOUND
        )

    def test_upload_audit_has_no_image_bytes(self, world):
        world.client("ada").put(
            t_url(world.tenant_a, "logo/"),
            {"file": upload()},
            format="multipart",
        )
        entry = ActivityEntry.objects.get(action="appearance.updated")
        old, new = entry.details["changes"]["logo"]
        assert old is None
        assert isinstance(new, str)
        assert len(new) == HASH_LENGTH  # the fingerprint only
