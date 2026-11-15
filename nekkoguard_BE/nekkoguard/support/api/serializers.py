from __future__ import annotations

from rest_framework import serializers

from nekkoguard.support.models import TEXT_MAX_LENGTH
from nekkoguard.support.models import TITLE_MAX_LENGTH
from nekkoguard.support.models import BugCategory
from nekkoguard.support.models import BugReport
from nekkoguard.support.models import BugSeverity


def _text(*, required: bool = False) -> serializers.CharField:
    return serializers.CharField(
        max_length=TEXT_MAX_LENGTH,
        required=required,
        allow_blank=not required,
        trim_whitespace=True,
    )


class BugReportCreateSerializer(serializers.Serializer):
    """Multipart form. Recipient, reporter and timestamps are never accepted."""

    client_token = serializers.UUIDField()
    title = serializers.CharField(max_length=TITLE_MAX_LENGTH, trim_whitespace=True)
    description = _text(required=True)
    category = serializers.ChoiceField(
        BugCategory.choices,
        required=False,
        allow_blank=True,
    )
    severity = serializers.ChoiceField(
        BugSeverity.choices,
        required=False,
        allow_blank=True,
    )
    steps_to_reproduce = _text()
    expected_behavior = _text()
    actual_behavior = _text()
    additional_comments = _text()
    attachment = serializers.FileField(required=False, allow_empty_file=False)
    # Context hints (validated against the reporter's access in services.py).
    tenant = serializers.UUIDField(required=False, allow_null=True)
    organization = serializers.UUIDField(required=False, allow_null=True)
    # Informational browser details (sanitized and truncated in services.py).
    page = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    client_version = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=200,
    )
    browser = serializers.CharField(required=False, allow_blank=True, max_length=500)
    operating_system = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=500,
    )
    viewport = serializers.CharField(required=False, allow_blank=True, max_length=100)


class BugReportResultSerializer(serializers.ModelSerializer[BugReport]):
    """What the reporter learns: the id and whether the email went out."""

    class Meta:
        model = BugReport
        fields = ["id", "email_status", "created_at"]
        read_only_fields = fields


class ReleaseChangesSerializer(serializers.Serializer):
    breaking = serializers.ListField(child=serializers.CharField(), required=False)
    security = serializers.ListField(child=serializers.CharField(), required=False)
    features = serializers.ListField(child=serializers.CharField(), required=False)
    improvements = serializers.ListField(child=serializers.CharField(), required=False)
    fixes = serializers.ListField(child=serializers.CharField(), required=False)


class ReleaseSerializer(serializers.Serializer):
    version = serializers.CharField()
    date = serializers.DateField()
    type = serializers.ChoiceField(["stable", "pre-release"])
    summary = serializers.CharField(allow_blank=True)
    changes = ReleaseChangesSerializer()


class ReleasesSerializer(serializers.Serializer):
    current_version = serializers.CharField()
    releases = ReleaseSerializer(many=True)
