from django.contrib import admin
from django.contrib.auth import admin as auth_admin
from django.utils.translation import gettext_lazy as _

from .admin_auth import install as install_admin_2fa
from .forms import UserAdminChangeForm
from .forms import UserAdminCreationForm
from .models import ImpersonationEvent
from .models import User

# Admin sign-in goes through the React frontend and requires 2FA (see admin_auth.py).
install_admin_2fa()


@admin.register(User)
class UserAdmin(auth_admin.UserAdmin):
    form = UserAdminChangeForm
    add_form = UserAdminCreationForm
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        (_("Personal info"), {"fields": ("name",)}),
        (
            _("Permissions"),
            {
                "fields": (
                    "is_active",
                    "is_staff",
                    "is_superuser",
                    "groups",
                    "user_permissions",
                ),
            },
        ),
        (_("Important dates"), {"fields": ("last_login", "date_joined")}),
    )
    list_display = ["email", "name", "is_superuser"]
    search_fields = ["name"]
    ordering = ["id"]
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("email", "password1", "password2"),
            },
        ),
    )


@admin.register(ImpersonationEvent)
class ImpersonationEventAdmin(admin.ModelAdmin):
    """Audit trail of superusers viewing the app as other users: read-only."""

    list_display = ["created_at", "actor_email", "action", "target_email"]
    list_filter = ["action"]
    search_fields = ["actor_email", "target_email"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
