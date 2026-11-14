from rest_framework import serializers

from nekkoguard.users.models import User


class UserSerializer(serializers.ModelSerializer[User]):
    class Meta:
        model = User
        fields = ["id", "email", "name", "is_staff", "url"]
        # Only `name` is editable through the API. Email changes go through the
        # verified allauth flow; staff status is managed in the Django admin.
        read_only_fields = ["id", "email", "is_staff"]

        extra_kwargs = {
            "url": {"view_name": "api:user-detail", "lookup_field": "pk"},
        }
