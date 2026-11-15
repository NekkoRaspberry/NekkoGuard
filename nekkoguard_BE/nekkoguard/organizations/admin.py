from django.contrib import admin

from .models import ActivityEntry
from .models import Network
from .models import Organization
from .models import OrganizationInvitation
from .models import OrganizationMembership
from .models import PermissionOverride
from .models import Site
from .models import Tenant
from .models import TenantMembership
from .models import TenantOrganizationAccess

# Note: the admin bypasses the API's escalation rules (services.py). It is for
# platform administrators only (is_staff); prefer the API for day-to-day changes.


class TenantMembershipInline(admin.TabularInline):
    model = TenantMembership
    extra = 0
    autocomplete_fields = ["user"]


@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ["name", "is_active", "created_at"]
    list_filter = ["is_active"]
    search_fields = ["name"]
    readonly_fields = ["created_by", "created_at", "updated_at"]
    inlines = [TenantMembershipInline]


class TenantOrganizationAccessInline(admin.TabularInline):
    model = TenantOrganizationAccess
    extra = 0
    autocomplete_fields = ["organization"]


@admin.register(TenantMembership)
class TenantMembershipAdmin(admin.ModelAdmin):
    list_display = ["user", "tenant", "role", "organization_access", "status"]
    list_filter = ["role", "organization_access", "status"]
    search_fields = ["user__email", "tenant__name"]
    autocomplete_fields = ["user", "tenant"]
    inlines = [TenantOrganizationAccessInline]


class OrganizationMembershipInline(admin.TabularInline):
    model = OrganizationMembership
    extra = 0
    autocomplete_fields = ["user"]


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ["name", "tenant", "is_active", "created_at"]
    list_filter = ["is_active"]
    search_fields = ["name", "tenant__name"]
    list_select_related = ["tenant"]
    readonly_fields = ["created_by", "created_at", "updated_at"]
    inlines = [OrganizationMembershipInline]


@admin.register(OrganizationMembership)
class OrganizationMembershipAdmin(admin.ModelAdmin):
    list_display = ["user", "organization", "role", "status"]
    list_filter = ["role", "status"]
    search_fields = ["user__email", "organization__name"]
    autocomplete_fields = ["user", "organization"]


@admin.register(PermissionOverride)
class PermissionOverrideAdmin(admin.ModelAdmin):
    list_display = ["user", "organization", "permission", "effect"]
    list_filter = ["effect", "permission"]
    search_fields = ["user__email", "organization__name"]
    autocomplete_fields = ["user", "organization"]


@admin.register(Site)
class SiteAdmin(admin.ModelAdmin):
    list_display = ["name", "organization"]
    search_fields = ["name", "organization__name"]
    list_select_related = ["organization"]


@admin.register(Network)
class NetworkAdmin(admin.ModelAdmin):
    list_display = ["name", "cidr", "site"]
    search_fields = ["name", "cidr", "site__name"]
    list_select_related = ["site"]


@admin.register(ActivityEntry)
class ActivityEntryAdmin(admin.ModelAdmin):
    """Audit trail: read-only."""

    list_display = [
        "created_at",
        "tenant",
        "organization",
        "actor_email",
        "action",
        "target_name",
    ]
    list_filter = ["action"]
    search_fields = ["actor_email", "target_name", "tenant__name"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(OrganizationInvitation)
class OrganizationInvitationAdmin(admin.ModelAdmin):
    """Invitations are created from the app (they need an email); here: read-only."""

    list_display = ["email", "organization", "status", "invited_by", "expires_at"]
    list_filter = ["status"]
    search_fields = ["email", "organization__name"]
    list_select_related = ["organization", "invited_by"]
    exclude = ["token_hash"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
