from django.contrib import admin
from django.utils.html import format_html

from .models import BugReport
from .models import TermsAcceptance
from .models import TermsVersion


@admin.register(BugReport)
class BugReportAdmin(admin.ModelAdmin):
    """Submitted reports: read-only (they are a record of what the user sent)."""

    list_display = [
        "created_at",
        "title",
        "severity",
        "category",
        "reporter_email",
        "tenant",
        "email_status",
    ]
    list_filter = ["email_status", "severity", "category"]
    search_fields = ["title", "reporter_email", "tenant__name", "organization__name"]
    exclude = ["attachment", "client_token"]
    readonly_fields = ["has_screenshot"]

    @admin.display(description="Screenshot")
    def has_screenshot(self, obj: BugReport) -> str:
        return format_html("{}", "Attached" if obj.attachment else "—")

    def get_readonly_fields(self, request, obj=None):
        fields = [f.name for f in BugReport._meta.fields if f.name not in self.exclude]  # noqa: SLF001
        return [*fields, "has_screenshot"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(TermsVersion)
class TermsVersionAdmin(admin.ModelAdmin):
    """Audit view. Terms are written and published in the app (Software > Terms)."""

    list_display = [
        "tenant",
        "number",
        "title",
        "status",
        "published_at",
        "published_by",
    ]
    list_filter = ["status"]
    search_fields = ["tenant__name", "title"]
    exclude = ["content"]

    def get_readonly_fields(self, request, obj=None):
        return [f.name for f in TermsVersion._meta.fields if f.name != "content"]  # noqa: SLF001

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(TermsAcceptance)
class TermsAcceptanceAdmin(admin.ModelAdmin):
    """Acceptance records: permanent, read-only."""

    list_display = ["accepted_at", "user_email", "tenant", "version"]
    search_fields = ["user_email", "tenant__name"]
    list_select_related = ["tenant", "version"]

    def get_readonly_fields(self, request, obj=None):
        return [f.name for f in TermsAcceptance._meta.fields]  # noqa: SLF001

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
