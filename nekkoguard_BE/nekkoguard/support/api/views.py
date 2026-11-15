"""Software API: release notes and bug reports (Terms of Service: api/terms.py)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.conf import settings
from django.db import transaction
from django.utils.decorators import method_decorator
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from nekkoguard.security.throttling import SensitiveThrottleMixin
from nekkoguard.support import content
from nekkoguard.support import services
from nekkoguard.support.models import ATTACHMENT_MAX_BYTES

from .serializers import BugReportCreateSerializer
from .serializers import BugReportResultSerializer
from .serializers import ReleasesSerializer

if TYPE_CHECKING:
    from rest_framework.request import Request

#: Text fields + one screenshot; anything larger is refused before parsing.
MAX_REQUEST_BYTES = ATTACHMENT_MAX_BYTES + 128 * 1024


class ReleasesView(APIView):
    """Published releases, newest first (unreleased work is never listed)."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=ReleasesSerializer)
    def get(self, request: Request) -> Response:
        return Response(
            {"current_version": settings.APP_VERSION, "releases": content.releases()},
        )


@method_decorator(transaction.non_atomic_requests, name="dispatch")
class BugReportView(SensitiveThrottleMixin, APIView):
    """
    Submit a bug report (multipart). Not atomic on purpose: the report is committed
    before the email is attempted, so a delivery failure never loses it. Changes are
    refused while "viewing as" another user (ImpersonationMiddleware).
    """

    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]
    throttle_scope = "bug_reports"

    @extend_schema(
        request={"multipart/form-data": BugReportCreateSerializer},
        responses={201: BugReportResultSerializer, 200: BugReportResultSerializer},
    )
    def post(self, request: Request) -> Response:
        length = int(request.headers.get("content-length") or 0)
        if length > MAX_REQUEST_BYTES:
            raise ValidationError(
                {"attachment": ["The screenshot must be 2 MB or smaller."]},
            )
        serializer = BugReportCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = dict(serializer.validated_data)
        attachment = values.pop("attachment", None)
        report, created = services.submit_report(
            user=request.user,  # type: ignore[arg-type]
            values=values,
            attachment=attachment,
        )
        return Response(
            BugReportResultSerializer(report).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )
