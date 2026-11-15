from rest_framework import serializers

from nekkoguard.organizations import access
from nekkoguard.users.models import User


class UserSerializer(serializers.ModelSerializer[User]):
    #: A second factor is active (authenticator app or security key).
    mfa_enabled = serializers.SerializerMethodField()
    #: Administers a Tenant (or is a superuser) without MFA: Tenant administration is
    #: refused (403 mfa_required) until MFA is turned on in Profile > Security.
    mfa_required = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "name",
            "is_staff",
            "mfa_enabled",
            "mfa_required",
            "url",
        ]
        # Only `name` is editable through the API. Email changes go through the
        # verified allauth flow; staff status is managed in the Django admin.
        read_only_fields = ["id", "email", "is_staff", "mfa_enabled", "mfa_required"]

        extra_kwargs = {
            "url": {"view_name": "api:user-detail", "lookup_field": "pk"},
        }

    def get_mfa_enabled(self, obj: User) -> bool:
        return access.has_mfa(obj)

    def get_mfa_required(self, obj: User) -> bool:
        """Administers a Tenant, but this session has not passed MFA: until then the
        user has Member rights there (set MFA up, or sign in again with the code)."""
        request = self.context.get("request")
        if request is None or request.user.pk != obj.pk:
            return False
        return access.admin_mfa_missing(request)
