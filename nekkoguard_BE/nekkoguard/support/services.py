"""
Bug report submission: server-side context, duplicate protection and the email.

Security rules:
- The reporter is always ``request.user``; nobody reports on behalf of someone else.
- Tenant and Organization ids from the browser are only *hints*: they are accepted
  only if the reporter can see them (``organizations.access``), otherwise refused.
- The recipient is never taken from the request: the Tenant's ``support_email``,
  else the platform's ``BUG_REPORT_EMAIL``.
- Browser details are short, sanitized strings. The page is reduced to its path
  (no query string or fragment), and one-time keys in known link paths are masked.
"""

from __future__ import annotations

import io
import logging
import re
from typing import TYPE_CHECKING
from typing import Any

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.db import IntegrityError
from django.db import transaction
from django.template.loader import render_to_string
from django.utils.translation import gettext_lazy as _
from PIL import Image
from rest_framework.exceptions import ValidationError

from nekkoguard.organizations import access
from nekkoguard.organizations.appearance import decode_image
from nekkoguard.organizations.models import Organization
from nekkoguard.organizations.models import Tenant

from .models import ATTACHMENT_MAX_BYTES
from .models import BugCategory
from .models import BugReport
from .models import BugSeverity
from .models import EmailStatus

if TYPE_CHECKING:
    import uuid

    from django.core.files.uploadedfile import UploadedFile

    from nekkoguard.users.models import User

logger = logging.getLogger(__name__)

#: Screenshots are scaled down to fit this box before re-encoding.
ATTACHMENT_MAX_SIDE = 2560
_CONTROL = re.compile(r"[\x00-\x1f\x7f]")
#: Frontend link paths whose last segment is a one-time secret (email links).
_SECRET_PATHS = re.compile(r"^/(invitations|reset-password|verify-email)/[^/]+")


def clean_line(value: str, max_length: int) -> str:
    """One line of informational text: no control characters, bounded length."""
    return _CONTROL.sub(" ", value or "").strip()[:max_length]


def clean_page(value: str) -> str:
    """Only the route path: never a query string, fragment or one-time key."""
    path = (value or "").split("?", 1)[0].split("#", 1)[0]
    if not path.startswith("/"):
        return ""
    path = _SECRET_PATHS.sub(lambda m: f"/{m.group(1)}/…", path)
    return clean_line(path, 300)


def resolve_context(
    user: User,
    tenant_id: uuid.UUID | None,
    organization_id: uuid.UUID | None,
) -> tuple[Tenant | None, Organization | None]:
    """Tenant/Organization the reporter was looking at, checked against their access."""
    if organization_id is not None:
        organization = (
            Organization.objects.select_related("tenant")
            .filter(pk=organization_id)
            .first()
        )
        if (
            organization is None
            or access.get_organization_access(user, organization) is None
        ):
            raise ValidationError({"organization": [_("Unknown organization.")]})
        if tenant_id is not None and organization.tenant_id != tenant_id:
            raise ValidationError({"organization": [_("Unknown organization.")]})
        return organization.tenant, organization
    if tenant_id is not None:
        tenant = access.visible_tenants(user).filter(pk=tenant_id).first()
        if tenant is None:
            raise ValidationError({"tenant": [_("Unknown tenant.")]})
        return tenant, None
    return None, None


def process_attachment(upload: UploadedFile) -> bytes:
    """PNG/JPEG/WebP up to 2 MB, re-encoded as PNG (drops metadata and hidden data)."""
    pixels = decode_image(upload, max_bytes=ATTACHMENT_MAX_BYTES, field="attachment")
    pixels.thumbnail(
        (ATTACHMENT_MAX_SIDE, ATTACHMENT_MAX_SIDE),
        Image.Resampling.LANCZOS,
    )
    out = io.BytesIO()
    pixels.save(out, format="PNG", optimize=True)
    return out.getvalue()


def recipient_for(tenant: Tenant | None) -> str:
    """The Tenant's support address, else the platform's. Empty: not configured."""
    if tenant is not None and tenant.support_email:
        return tenant.support_email
    return settings.BUG_REPORT_EMAIL


def _display_name(user: User | None, email: str) -> str:
    if user is not None and user.name:
        return f"{user.name} <{email}>"
    return email


def send_report_email(report: BugReport, recipient: str) -> None:
    """HTML + plain text; the reporter is the Reply-To so support can answer."""
    context = {
        "report": report,
        "category": BugCategory(report.category).label if report.category else "",
        "severity": BugSeverity(report.severity).label if report.severity else "",
        "reporter": _display_name(report.reporter, report.reporter_email),
        "tenant_name": report.tenant.name if report.tenant else "",
        "organization_name": report.organization.name if report.organization else "",
    }
    subject = render_to_string("support/email/bug_report_subject.txt", context)
    message = EmailMultiAlternatives(
        subject=" ".join(subject.split()),  # one line, no header injection
        body=render_to_string("support/email/bug_report_message.txt", context),
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[recipient],
        reply_to=[report.reporter_email],
    )
    message.attach_alternative(
        render_to_string("support/email/bug_report_message.html", context),
        "text/html",
    )
    if report.attachment:
        message.attach("screenshot.png", bytes(report.attachment), "image/png")
    message.send()


def submit_report(
    *,
    user: User,
    values: dict[str, Any],
    attachment: UploadedFile | None,
) -> tuple[BugReport, bool]:
    """
    Store the report, then email it. Returns ``(report, created)``; a retried
    submission (same ``client_token``) returns the first report unchanged.

    Runs outside the request transaction (the view is non-atomic) so the report is
    committed before the email is attempted: a failed email never loses the report.
    """
    token = values["client_token"]
    existing = BugReport.objects.filter(reporter=user, client_token=token).first()
    if existing is not None:
        return existing, False

    tenant, organization = resolve_context(
        user,
        values.get("tenant"),
        values.get("organization"),
    )
    image = process_attachment(attachment) if attachment is not None else None
    recipient = recipient_for(tenant)
    try:
        with transaction.atomic():
            report = BugReport.objects.create(
                reporter=user,
                reporter_email=user.email,
                tenant=tenant,
                organization=organization,
                title=values["title"],
                description=values["description"],
                category=values.get("category", ""),
                severity=values.get("severity", ""),
                steps_to_reproduce=values.get("steps_to_reproduce", ""),
                expected_behavior=values.get("expected_behavior", ""),
                actual_behavior=values.get("actual_behavior", ""),
                additional_comments=values.get("additional_comments", ""),
                attachment=image,
                app_version=settings.APP_VERSION,
                client_version=clean_line(values.get("client_version", ""), 32),
                page=clean_page(values.get("page", "")),
                browser=clean_line(values.get("browser", ""), 120),
                operating_system=clean_line(values.get("operating_system", ""), 120),
                viewport=clean_line(values.get("viewport", ""), 20),
                client_token=token,
                email_status=EmailStatus.NOT_CONFIGURED,
                email_recipient=recipient,
            )
    except IntegrityError:
        # Two identical requests raced: the other one stored the report.
        return BugReport.objects.get(reporter=user, client_token=token), False

    if not recipient:
        logger.warning("Bug report %s stored; no recipient configured", report.pk)
        return report, True
    try:
        send_report_email(report, recipient)
    except Exception as error:
        logger.exception("Bug report %s stored; email failed", report.pk)
        report.email_status = EmailStatus.FAILED
        report.email_error = clean_line(type(error).__name__, 300)
    else:
        report.email_status = EmailStatus.SENT
    report.save(update_fields=["email_status", "email_error"])
    return report, True
