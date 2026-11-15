"""Bug reports submitted from the app (Help > Report a bug)."""

from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _

TITLE_MAX_LENGTH = 150
TEXT_MAX_LENGTH = 5000
#: Screenshot limit (re-encoded to PNG, metadata dropped).
ATTACHMENT_MAX_BYTES = 2 * 1024 * 1024


class BugCategory(models.TextChoices):
    UI = "ui", _("UI / Visual issue")
    FUNCTIONAL = "functional", _("Functional issue")
    PERFORMANCE = "performance", _("Performance issue")
    DATA = "data", _("Data issue")
    ACCESS = "access", _("Authentication / Access issue")
    OTHER = "other", _("Other")


class BugSeverity(models.TextChoices):
    LOW = "low", _("Low")
    MEDIUM = "medium", _("Medium")
    HIGH = "high", _("High")
    CRITICAL = "critical", _("Critical")


class EmailStatus(models.TextChoices):
    SENT = "sent", _("Sent")
    FAILED = "failed", _("Failed")
    #: Neither the Tenant's support email nor BUG_REPORT_EMAIL is set.
    NOT_CONFIGURED = "not_configured", _("No recipient configured")


class BugReport(models.Model):
    """
    One report. Reporter, Tenant and Organization are resolved on the server; the
    browser details are informational only (as reported by the user's browser).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reporter = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="+",
    )
    # Copied so the report stays readable if the account or Tenant is deleted.
    reporter_email = models.EmailField(_("reporter email"))
    tenant = models.ForeignKey(
        "organizations.Tenant",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    title = models.CharField(_("title"), max_length=TITLE_MAX_LENGTH)
    description = models.TextField(_("description"))
    category = models.CharField(
        _("category"),
        max_length=16,
        choices=BugCategory,
        blank=True,
    )
    severity = models.CharField(
        _("severity"),
        max_length=16,
        choices=BugSeverity,
        blank=True,
    )
    steps_to_reproduce = models.TextField(_("steps to reproduce"), blank=True)
    expected_behavior = models.TextField(_("expected behavior"), blank=True)
    actual_behavior = models.TextField(_("actual behavior"), blank=True)
    additional_comments = models.TextField(_("additional comments"), blank=True)
    #: Optional screenshot, validated and re-encoded as PNG.
    attachment = models.BinaryField(_("screenshot"), null=True, blank=True)
    # Context. app_version comes from the server; the rest from the browser.
    app_version = models.CharField(_("server version"), max_length=32)
    client_version = models.CharField(_("frontend version"), max_length=32, blank=True)
    page = models.CharField(_("page"), max_length=300, blank=True)
    browser = models.CharField(_("browser"), max_length=120, blank=True)
    operating_system = models.CharField(
        _("operating system"),
        max_length=120,
        blank=True,
    )
    viewport = models.CharField(_("viewport"), max_length=20, blank=True)
    #: Random id from the browser: a retried submission returns the first report.
    client_token = models.UUIDField(_("client token"))
    email_status = models.CharField(
        _("email status"),
        max_length=16,
        choices=EmailStatus,
    )
    email_recipient = models.EmailField(_("emailed to"), blank=True)
    email_error = models.CharField(_("email error"), max_length=300, blank=True)
    created_at = models.DateTimeField(_("submitted at"), auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["reporter", "client_token"],
                name="bug_report_unique_client_token",
            ),
        ]

    def __str__(self) -> str:
        return self.title


# ---------------------------------------------------------------- Terms of Service


class TermsStatus(models.TextChoices):
    DRAFT = "draft", _("Draft")
    CURRENT = "current", _("Current")
    #: Replaced by a newer version (shown as "Outdated").
    SUPERSEDED = "superseded", _("Outdated")


class PublishedTermsAreImmutableError(Exception):
    """A published version's text, title or number was about to change."""


class TermsVersion(models.Model):
    """
    One version of a Tenant's Terms of Service.

    Lifecycle: draft → current (published) → superseded. A Tenant has at most one
    draft and at most one current version (database constraints). Once published,
    the title, content, hash and number never change: corrections are a new version.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # PROTECT: versions and their acceptances are an audit record.
    tenant = models.ForeignKey(
        "organizations.Tenant",
        on_delete=models.PROTECT,
        related_name="terms_versions",
    )
    #: 1, 2, 3… per Tenant, assigned when published (drafts have none).
    number = models.PositiveIntegerField(_("version"), null=True, blank=True)
    title = models.CharField(_("title"), max_length=150)
    #: ProseMirror (Tiptap) JSON, validated by ``document.clean_document``.
    content = models.JSONField(_("content"))
    #: SHA-256 of title + canonical content, set when published.
    content_hash = models.CharField(_("content hash"), max_length=64, blank=True)
    status = models.CharField(
        _("status"),
        max_length=16,
        choices=TermsStatus,
        default=TermsStatus.DRAFT,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="+",
    )
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="+",
    )
    updated_at = models.DateTimeField(_("updated at"), auto_now=True)
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    published_at = models.DateTimeField(_("published at"), null=True, blank=True)
    effective_date = models.DateField(_("effective date"), null=True, blank=True)
    superseded_at = models.DateTimeField(_("superseded at"), null=True, blank=True)

    class Meta:
        ordering = ["tenant", "-number"]
        constraints = [
            models.UniqueConstraint(
                fields=["tenant"],
                condition=models.Q(status="current"),
                name="terms_one_current_version_per_tenant",
            ),
            models.UniqueConstraint(
                fields=["tenant"],
                condition=models.Q(status="draft"),
                name="terms_one_draft_per_tenant",
            ),
            models.UniqueConstraint(
                fields=["tenant", "number"],
                name="terms_unique_version_number",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(
                        status="draft",
                        number__isnull=True,
                        published_at__isnull=True,
                    )
                    | (
                        ~models.Q(status="draft")
                        & models.Q(number__isnull=False, published_at__isnull=False)
                        & ~models.Q(content_hash="")
                    )
                ),
                name="terms_published_versions_are_complete",
            ),
        ]

    def __str__(self) -> str:
        return (
            f"{self.title} v{self.number}" if self.number else f"{self.title} (draft)"
        )

    def save(self, *args, **kwargs) -> None:
        if not self._state.adding:
            stored = (
                TermsVersion.objects.filter(pk=self.pk)
                .values("status", "title", "content", "content_hash", "number")
                .first()
            )
            if stored and stored["status"] != TermsStatus.DRAFT:
                for field in ("title", "content", "content_hash", "number"):
                    if stored[field] != getattr(self, field):
                        msg = "Published Terms of Service cannot be changed."
                        raise PublishedTermsAreImmutableError(msg)
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        if self.status != TermsStatus.DRAFT:
            msg = "Published Terms of Service cannot be deleted."
            raise PublishedTermsAreImmutableError(msg)
        return super().delete(*args, **kwargs)


class TermsAcceptance(models.Model):
    """A user's acceptance of one exact published version. Never changed or deleted."""

    tenant = models.ForeignKey(
        "organizations.Tenant",
        on_delete=models.PROTECT,
        related_name="+",
    )
    # SET_NULL + copied email: the record outlives the account.
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="terms_acceptances",
    )
    user_email = models.EmailField(_("user email"))
    version = models.ForeignKey(
        TermsVersion,
        on_delete=models.PROTECT,
        related_name="acceptances",
    )
    #: The hash of the version accepted (integrity check against the version row).
    content_hash = models.CharField(_("content hash"), max_length=64)
    accepted_at = models.DateTimeField(_("accepted at"), auto_now_add=True)
    user_agent = models.CharField(_("user agent"), max_length=300, blank=True)

    class Meta:
        ordering = ["-accepted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "version"],
                name="terms_accept_each_version_once",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.user_email} accepted {self.version}"
