import io
import uuid
from unittest import mock

import pytest
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework import status
from rest_framework.test import APIClient

from nekkoguard.conftest import enable_totp
from nekkoguard.conftest import sign_in
from nekkoguard.organizations.roles import OrganizationAccess
from nekkoguard.organizations.tests.factories import OrganizationFactory
from nekkoguard.organizations.tests.factories import OrganizationMembershipFactory
from nekkoguard.organizations.tests.factories import TenantFactory
from nekkoguard.organizations.tests.factories import TenantMembershipFactory
from nekkoguard.support.models import BugReport
from nekkoguard.support.models import EmailStatus
from nekkoguard.users.tests.factories import UserFactory

URL = "/api/bug-reports/"
PLATFORM = "reports@platform.example"
# Transactional: the view runs outside the request transaction (non-atomic) like in
# production, so DRF's rollback-on-error does not poison the test's transaction.
pytestmark = pytest.mark.django_db(transaction=True)


def client_for(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


def payload(**extra):
    return {
        "client_token": str(uuid.uuid4()),
        "title": "Export button does nothing",
        "description": "Clicking Export on Members shows no file.",
        **extra,
    }


def png(size=(40, 30)):
    out = io.BytesIO()
    Image.new("RGB", size, (200, 10, 10)).save(out, format="PNG")
    return SimpleUploadedFile("shot.png", out.getvalue(), content_type="image/png")


@pytest.fixture
def setup(settings):
    settings.BUG_REPORT_EMAIL = PLATFORM
    tenant = TenantFactory(support_email="help@tenant.example")
    organization = OrganizationFactory(tenant=tenant)
    user = UserFactory()
    OrganizationMembershipFactory(organization=organization, user=user)
    return tenant, organization, user


def test_requires_authentication():
    assert APIClient().post(URL, payload()).status_code == status.HTTP_403_FORBIDDEN


def test_minimal_report_goes_to_the_platform_address(setup):
    _tenant, _org, user = setup
    response = client_for(user).post(URL, payload())
    assert response.status_code == status.HTTP_201_CREATED
    assert response.data["email_status"] == EmailStatus.SENT
    report = BugReport.objects.get()
    assert report.reporter == user
    assert report.reporter_email == user.email
    assert report.tenant is None
    assert len(mail.outbox) == 1
    sent = mail.outbox[0]
    assert sent.to == [PLATFORM]
    assert sent.reply_to == [user.email]
    assert sent.subject == "[NekkoGuard Bug Report] Export button does nothing"
    assert "Clicking Export" in sent.body


def test_organization_context_uses_the_tenant_support_email(setup):
    tenant, organization, user = setup
    response = client_for(user).post(
        URL,
        payload(
            tenant=str(tenant.pk),
            organization=str(organization.pk),
            severity="high",
        ),
    )
    assert response.status_code == status.HTTP_201_CREATED
    report = BugReport.objects.get()
    assert (report.tenant, report.organization) == (tenant, organization)
    assert mail.outbox[0].to == ["help@tenant.example"]
    assert organization.name in mail.outbox[0].body
    assert "Severity: High" in mail.outbox[0].body


def test_organization_alone_implies_its_tenant(setup):
    tenant, organization, user = setup
    client_for(user).post(URL, payload(organization=str(organization.pk)))
    assert BugReport.objects.get().tenant == tenant


def test_recipient_cannot_be_chosen_by_the_request(setup):
    _tenant, _org, user = setup
    client_for(user).post(
        URL,
        payload(recipient="attacker@evil.example", email_recipient="x@evil.example"),
    )
    assert mail.outbox[0].to == [PLATFORM]


@pytest.mark.parametrize("field", ["organization", "tenant"])
def test_context_the_reporter_cannot_see_is_refused(setup, field):
    _tenant, _org, user = setup
    other_tenant = TenantFactory()
    other = OrganizationFactory(tenant=other_tenant)
    target = other if field == "organization" else other_tenant
    response = client_for(user).post(URL, payload(**{field: str(target.pk)}))
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert not BugReport.objects.exists()
    assert not mail.outbox


def test_organization_of_another_tenant_is_refused(setup):
    _tenant, organization, user = setup
    other_tenant = TenantFactory()
    TenantMembershipFactory(
        tenant=other_tenant,
        user=user,
        organization_access=OrganizationAccess.ALL,
    )
    response = client_for(user).post(
        URL,
        payload(tenant=str(other_tenant.pk), organization=str(organization.pk)),
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST


def test_tenant_member_without_organizations_can_report_for_the_tenant(setup):
    tenant, _org, _user = setup
    member = UserFactory()
    TenantMembershipFactory(tenant=tenant, user=member)
    response = client_for(member).post(URL, payload(tenant=str(tenant.pk)))
    assert response.status_code == status.HTTP_201_CREATED
    assert mail.outbox[0].to == ["help@tenant.example"]


def test_without_any_recipient_the_report_is_kept(setup, settings):
    _tenant, _org, user = setup
    settings.BUG_REPORT_EMAIL = ""
    response = client_for(user).post(URL, payload())
    assert response.status_code == status.HTTP_201_CREATED
    assert response.data["email_status"] == EmailStatus.NOT_CONFIGURED
    assert BugReport.objects.count() == 1
    assert not mail.outbox


def test_email_failure_keeps_the_report_and_says_so(setup):
    _tenant, _org, user = setup
    with mock.patch(
        "nekkoguard.support.services.send_report_email",
        side_effect=ConnectionRefusedError("smtp down"),
    ):
        response = client_for(user).post(URL, payload())
    assert response.status_code == status.HTTP_201_CREATED
    assert response.data["email_status"] == EmailStatus.FAILED
    report = BugReport.objects.get()
    assert report.email_status == EmailStatus.FAILED
    assert report.email_error == "ConnectionRefusedError"


def test_a_retried_submission_returns_the_first_report(setup):
    _tenant, _org, user = setup
    data = payload()
    first = client_for(user).post(URL, data)
    again = client_for(user).post(URL, data)
    assert first.status_code == status.HTTP_201_CREATED
    assert again.status_code == status.HTTP_200_OK
    assert again.data["id"] == first.data["id"]
    assert BugReport.objects.count() == 1
    assert len(mail.outbox) == 1


def test_same_token_from_another_user_is_a_separate_report(setup):
    _tenant, _org, user = setup
    data = payload()
    client_for(user).post(URL, data)
    response = client_for(UserFactory()).post(URL, data)
    assert response.status_code == status.HTTP_201_CREATED
    assert BugReport.objects.filter(client_token=data["client_token"]).count() == 2  # noqa: PLR2004


@pytest.mark.parametrize(
    "data",
    [
        {"title": ""},
        {"description": ""},
        {"title": "x" * 151},
        {"severity": "urgent"},
        {"client_token": "not-a-uuid"},
    ],
)
def test_validation(setup, data):
    _tenant, _org, user = setup
    response = client_for(user).post(URL, payload(**data))
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert not BugReport.objects.exists()


def test_browser_context_is_sanitized(setup, settings):
    _tenant, _org, user = setup
    client_for(user).post(
        URL,
        payload(
            page="/invitations/SECRETTOKEN123456789012?x=1#frag",
            browser="Firefox 140\r\nBcc: someone@evil.example",
            viewport="1440x900",
            client_version="0.1.0",
        ),
    )
    report = BugReport.objects.get()
    assert report.page == "/invitations/…"
    assert "\n" not in report.browser
    assert report.app_version == settings.APP_VERSION


def test_screenshot_is_reencoded_and_attached(setup):
    _tenant, _org, user = setup
    response = client_for(user).post(
        URL,
        {**payload(), "attachment": png()},
        format="multipart",
    )
    assert response.status_code == status.HTTP_201_CREATED
    report = BugReport.objects.get()
    assert bytes(report.attachment).startswith(b"\x89PNG")
    assert mail.outbox[0].attachments[0][0] == "screenshot.png"


@pytest.mark.parametrize(
    "upload",
    [
        SimpleUploadedFile("shot.svg", b"<svg/>", content_type="image/svg+xml"),
        SimpleUploadedFile("shot.png", b"not an image", content_type="image/png"),
    ],
)
def test_invalid_screenshots_are_refused(setup, upload):
    _tenant, _org, user = setup
    response = client_for(user).post(
        URL,
        {**payload(), "attachment": upload},
        format="multipart",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "attachment" in response.data
    assert not BugReport.objects.exists()


def test_reports_cannot_be_read_back_through_the_api(setup):
    _tenant, _org, user = setup
    client_for(user).post(URL, payload())
    assert client_for(user).get(URL).status_code == status.HTTP_405_METHOD_NOT_ALLOWED


def test_help_content_requires_sign_in(setup):
    _tenant, _org, user = setup
    path = "/api/help/releases/"
    assert APIClient().get(path).status_code == status.HTTP_403_FORBIDDEN
    assert client_for(user).get(path).status_code == status.HTTP_200_OK
    releases = client_for(user).get("/api/help/releases/").data
    assert releases["releases"][0]["version"] == "0.1.0-alpha.1"


def test_tenant_support_email_is_set_by_tenant_administrators(setup):
    tenant, _org, _user = setup
    admin = UserFactory()
    enable_totp(admin)  # Tenant administration requires MFA
    TenantMembershipFactory(
        tenant=tenant,
        user=admin,
        role="admin",
        organization_access=OrganizationAccess.ALL,
    )
    url = f"/api/tenants/{tenant.pk}/"
    response = sign_in(APIClient(), admin).patch(
        url,
        {"support_email": " Support@Tenant.Example "},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK
    assert response.data["support_email"] == "support@tenant.example"
    member = UserFactory()
    TenantMembershipFactory(tenant=tenant, user=member)
    response = client_for(member).patch(
        url,
        {"support_email": "x@evil.example"},
        format="json",
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN
    response = sign_in(APIClient(), admin).patch(
        url,
        {"support_email": "not-an-email"},
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
