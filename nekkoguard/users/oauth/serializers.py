from __future__ import annotations

from django.conf import settings
from oauth2_provider.generators import generate_client_secret
from oauth2_provider.models import AbstractApplication
from oauth2_provider.models import get_application_model
from rest_framework import serializers

Application = get_application_model()

# Only the authorization-code flow (with PKCE, enforced in settings) is offered.
GRANT_TYPE = AbstractApplication.GRANT_AUTHORIZATION_CODE


class ApplicationSerializer(serializers.ModelSerializer):
    """An application as staff see it. The client secret is never returned here."""

    redirect_uris = serializers.SerializerMethodField()

    class Meta:
        model = Application
        fields = ["id", "name", "client_id", "client_type", "redirect_uris", "created"]
        read_only_fields = fields

    def get_redirect_uris(self, app) -> list[str]:
        return app.redirect_uris.split()


class ApplicationCreateSerializer(serializers.ModelSerializer):
    """Register an application. The plain client secret is returned once."""

    redirect_uris = serializers.ListField(
        child=serializers.URLField(),
        min_length=1,
        max_length=10,
    )
    client_type = serializers.ChoiceField(
        choices=[
            AbstractApplication.CLIENT_CONFIDENTIAL,
            AbstractApplication.CLIENT_PUBLIC,
        ],
    )
    client_secret = serializers.CharField(read_only=True)

    class Meta:
        model = Application
        fields = [
            "id",
            "name",
            "client_id",
            "client_type",
            "redirect_uris",
            "client_secret",
            "created",
        ]
        read_only_fields = ["id", "client_id", "client_secret", "created"]

    def validate_redirect_uris(self, uris: list[str]) -> list[str]:
        allowed = settings.OAUTH2_PROVIDER.get(
            "ALLOWED_REDIRECT_URI_SCHEMES", ["https"],
        )
        for uri in uris:
            if uri.split(":", 1)[0] not in allowed or "#" in uri:
                msg = f"Not an allowed redirect URL: {uri}"
                raise serializers.ValidationError(msg)
        return uris

    def create(self, validated_data):
        secret = generate_client_secret()
        oidc = settings.OAUTH2_PROVIDER.get("OIDC_ENABLED", False)
        app = Application.objects.create(
            name=validated_data["name"],
            client_type=validated_data["client_type"],
            redirect_uris=" ".join(validated_data["redirect_uris"]),
            authorization_grant_type=GRANT_TYPE,
            client_secret=secret,  # hashed on save (hash_client_secret=True)
            algorithm=Application.RS256_ALGORITHM if oidc else Application.NO_ALGORITHM,
            user=self.context["request"].user,
            skip_authorization=False,
        )
        app.plain_client_secret = secret
        return app

    def to_representation(self, app):
        data = ApplicationSerializer(app).data
        if app.client_type == AbstractApplication.CLIENT_CONFIDENTIAL:
            data["client_secret"] = getattr(app, "plain_client_secret", None)
        return data
