"""
Tenant Terms of Service API.

Users:   GET /api/terms/pending/, POST /api/terms/{id}/accept/, POST /api/terms/decline/
Tenant:  GET /api/tenants/{t}/terms/  (current version, my acceptance)
Admins:  /api/tenants/{t}/terms/versions/[{id}/[publish/]]  and  …/terms/acceptances/

Managing (drafts, publishing, history, acceptance records) needs ``tenant.manage``
(a Tenant administrator, whatever their organization access: the Terms are a Tenant
setting, like its name or appearance) or a superuser. Tenant ids from the URL are
always resolved against the caller's access.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from django.contrib.auth import logout
from django.db.models import Case
from django.db.models import CharField
from django.db.models import Count
from django.db.models import Exists
from django.db.models import F
from django.db.models import OuterRef
from django.db.models import Q
from django.db.models import Subquery
from django.db.models import Value
from django.db.models import When
from django.shortcuts import get_object_or_404
from django.utils.translation import gettext_lazy as _
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.exceptions import PermissionDenied
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from nekkoguard.organizations import access
from nekkoguard.organizations.api.permissions import OrganizationScopedMixin
from nekkoguard.organizations.api.views import VIEW_ACCESS
from nekkoguard.organizations.roles import TenantPermission
from nekkoguard.support import terms
from nekkoguard.support.models import TermsAcceptance
from nekkoguard.support.models import TermsStatus
from nekkoguard.support.models import TermsVersion

if TYPE_CHECKING:
    from rest_framework.request import Request

    from nekkoguard.organizations.models import Tenant

# ---------------------------------------------------------------- serializers


class _Person(serializers.Serializer):
    id = serializers.IntegerField()
    email = serializers.EmailField()
    name = serializers.CharField()


def _person(user) -> dict | None:
    return {"id": user.pk, "email": user.email, "name": user.name} if user else None


class TermsVersionSummarySerializer(serializers.ModelSerializer[TermsVersion]):
    created_by = serializers.SerializerMethodField()
    published_by = serializers.SerializerMethodField()
    accepted_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = TermsVersion
        fields = [
            "id",
            "number",
            "title",
            "status",
            "content_hash",
            "created_at",
            "created_by",
            "updated_at",
            "published_at",
            "published_by",
            "effective_date",
            "superseded_at",
            "accepted_count",
        ]
        read_only_fields = fields

    @extend_schema(responses=_Person(allow_null=True))
    def get_created_by(self, obj: TermsVersion) -> dict | None:
        return _person(obj.created_by)

    @extend_schema(responses=_Person(allow_null=True))
    def get_published_by(self, obj: TermsVersion) -> dict | None:
        return _person(obj.published_by)


class TermsVersionSerializer(TermsVersionSummarySerializer):
    tenant = serializers.SerializerMethodField()

    class Meta(TermsVersionSummarySerializer.Meta):
        fields = [*TermsVersionSummarySerializer.Meta.fields, "tenant", "content"]
        read_only_fields = fields

    def get_tenant(self, obj: TermsVersion) -> dict:
        return {"id": str(obj.tenant_id), "name": obj.tenant.name}


class DraftWriteSerializer(serializers.Serializer):
    title = serializers.CharField(required=False, max_length=300)
    content = serializers.JSONField(required=False)


class AcceptanceRowSerializer(serializers.Serializer):
    user = _Person()
    status = serializers.ChoiceField(
        ["accepted_current", "accepted_older", "never", "not_required"],
    )
    accepted_version = serializers.IntegerField(allow_null=True)
    accepted_at = serializers.DateTimeField(allow_null=True)


# ---------------------------------------------------------------- helpers


def _tenant_for(request: Request, tenant_pk: str) -> Tenant:
    """A Tenant the caller can see (404 otherwise: existence is not revealed)."""
    try:
        pk = uuid.UUID(str(tenant_pk))
    except ValueError:
        raise NotFound from None
    tenant = access.visible_tenants(request.user).filter(pk=pk).first()
    if tenant is None:
        raise NotFound
    return tenant


def can_manage_terms(user, tenant: Tenant) -> bool:
    tenant_access = access.get_tenant_access(user, tenant)
    return bool(
        tenant_access is not None and tenant_access.can(TenantPermission.MANAGE),
    )


MANAGE_DENIED = _("Only tenant administrators can manage the Terms of Service.")


def _managed_tenant(request: Request, tenant_pk: str) -> Tenant:
    tenant = _tenant_for(request, tenant_pk)
    if not can_manage_terms(request.user, tenant):
        raise PermissionDenied(MANAGE_DENIED)
    return tenant


def _with_counts(queryset):
    return queryset.annotate(accepted_count=Count("acceptances", distinct=True))


# ---------------------------------------------------------------- users


class PendingTermsView(APIView):
    """Current Terms the caller still has to accept (one per Tenant, by Tenant name)."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=TermsVersionSerializer(many=True))
    def get(self, request: Request) -> Response:
        if getattr(request, "real_user", None) is not None:
            return Response([])  # "view as" is read-only: never asked to accept
        versions = terms.pending_versions(request.user)  # type: ignore[arg-type]
        return Response(TermsVersionSerializer(versions, many=True).data)


class AcceptTermsView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses={200: None})
    def post(self, request: Request, version_pk: uuid.UUID) -> Response:
        version = get_object_or_404(
            TermsVersion.objects.select_related("tenant"),
            pk=version_pk,
        )
        if version.tenant_id not in terms.subject_tenant_ids(request.user):  # type: ignore[arg-type]
            raise NotFound  # another Tenant's Terms: not revealed
        terms.accept(
            user=request.user,  # type: ignore[arg-type]
            version=version,
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
        )
        remaining = terms.pending_versions(request.user).count()  # type: ignore[arg-type]
        return Response({"accepted": True, "pending": remaining})


class DeclineTermsView(APIView):
    """Refuse the pending Terms: recorded in each Tenant's activity, then signed out."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses={200: None})
    def post(self, request: Request) -> Response:
        terms.record_decline(user=request.user)  # type: ignore[arg-type]
        logout(request._request)  # noqa: SLF001 - ends the Django session
        return Response({"signed_out": True})


# ---------------------------------------------------------------- tenant


class TenantTermsView(APIView):
    """The Tenant's current Terms (any member) and the caller's acceptance of them."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request, tenant_pk: str) -> Response:
        tenant = _tenant_for(request, tenant_pk)
        current = terms.current_version(tenant)
        accepted_at = None
        if current is not None:
            acceptance = TermsAcceptance.objects.filter(
                user=request.user,
                version=current,
            ).first()
            accepted_at = acceptance.accepted_at if acceptance else None
        return Response(
            {
                "current": TermsVersionSerializer(current).data if current else None,
                "accepted_at": accepted_at,
                "can_manage": can_manage_terms(request.user, tenant),
            },
        )


class TermsHistoryView(APIView):
    """Published versions (newest first), readable by everyone who sees the Tenant.
    Drafts and acceptance counts are for administrators only (``versions/``)."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=TermsVersionSummarySerializer(many=True))
    def get(self, request: Request, tenant_pk: str) -> Response:
        tenant = _tenant_for(request, tenant_pk)
        versions = (
            TermsVersion.objects.filter(tenant=tenant)
            .exclude(status=TermsStatus.DRAFT)
            .select_related("created_by", "published_by")
            .order_by("-number")
        )
        data = TermsVersionSummarySerializer(versions, many=True).data
        for row in data:
            row.pop("accepted_count", None)
        return Response(data)


class TermsHistoryDetailView(APIView):
    """One published version, read-only (members of the Tenant)."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=TermsVersionSerializer)
    def get(self, request: Request, tenant_pk: str, version_pk: uuid.UUID) -> Response:
        tenant = _tenant_for(request, tenant_pk)
        version = get_object_or_404(
            TermsVersion.objects.select_related("tenant", "published_by").exclude(
                status=TermsStatus.DRAFT,
            ),
            pk=version_pk,
            tenant=tenant,
        )
        data = TermsVersionSerializer(version).data
        data.pop("accepted_count", None)
        return Response(data)


class TermsVersionListView(APIView):
    """All versions (draft first, then newest published) with acceptance counts."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=TermsVersionSummarySerializer(many=True))
    def get(self, request: Request, tenant_pk: str) -> Response:
        tenant = _managed_tenant(request, tenant_pk)
        versions = _with_counts(
            TermsVersion.objects.filter(tenant=tenant).select_related(
                "created_by",
                "published_by",
            ),
        ).order_by(
            Case(When(status=TermsStatus.DRAFT, then=Value(0)), default=Value(1)),
            "-number",
        )
        required = terms.subject_users(tenant)
        current = terms.current_version(tenant)
        accepted = (
            required.filter(terms_acceptances__version=current).count()
            if current
            else 0
        )
        total = required.count()
        return Response(
            {
                "versions": TermsVersionSummarySerializer(versions, many=True).data,
                "current_stats": {
                    "required": total,
                    "accepted": accepted,
                    "pending": total - accepted if current else 0,
                },
            },
        )

    @extend_schema(request=None, responses={201: TermsVersionSerializer})
    def post(self, request: Request, tenant_pk: str) -> Response:
        tenant = _managed_tenant(request, tenant_pk)
        draft = terms.create_draft(actor=request.user, tenant=tenant)  # type: ignore[arg-type]
        return Response(
            TermsVersionSerializer(draft).data,
            status=status.HTTP_201_CREATED,
        )


class TermsVersionDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _version(self, request: Request, tenant_pk: str, version_pk: uuid.UUID):
        tenant = _managed_tenant(request, tenant_pk)
        return get_object_or_404(
            _with_counts(TermsVersion.objects.select_related("tenant")),
            pk=version_pk,
            tenant=tenant,
        )

    @extend_schema(responses=TermsVersionSerializer)
    def get(self, request: Request, tenant_pk: str, version_pk: uuid.UUID) -> Response:
        return Response(
            TermsVersionSerializer(self._version(request, tenant_pk, version_pk)).data,
        )

    @extend_schema(request=DraftWriteSerializer, responses=TermsVersionSerializer)
    def patch(
        self,
        request: Request,
        tenant_pk: str,
        version_pk: uuid.UUID,
    ) -> Response:
        version = self._version(request, tenant_pk, version_pk)
        body = DraftWriteSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        draft = terms.update_draft(
            actor=request.user,  # type: ignore[arg-type]
            draft=version,
            title=body.validated_data.get("title"),
            content=body.validated_data.get("content"),
        )
        return Response(TermsVersionSerializer(draft).data)

    def delete(
        self,
        request: Request,
        tenant_pk: str,
        version_pk: uuid.UUID,
    ) -> Response:
        version = self._version(request, tenant_pk, version_pk)
        terms.discard_draft(actor=request.user, draft=version)  # type: ignore[arg-type]
        return Response(status=status.HTTP_204_NO_CONTENT)


class PublishTermsView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses=TermsVersionSerializer)
    def post(self, request: Request, tenant_pk: str, version_pk: uuid.UUID) -> Response:
        tenant = _managed_tenant(request, tenant_pk)
        draft = get_object_or_404(TermsVersion, pk=version_pk, tenant=tenant)
        published = terms.publish(actor=request.user, draft=draft)  # type: ignore[arg-type]
        return Response(TermsVersionSerializer(published).data)


class AcceptancePagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100


ACCEPTANCE_STATUSES = {"accepted_current", "accepted_older", "never", "not_required"}


def acceptance_rows(tenant: Tenant, users, params) -> object:
    """Where each user stands with the Tenant's Terms, filtered by query params."""
    current = terms.current_version(tenant)
    mine = TermsAcceptance.objects.filter(tenant=tenant, user=OuterRef("pk"))
    latest = mine.order_by("-accepted_at")
    has_current = Exists(mine.filter(version=current)) if current else Value(False)  # noqa: FBT003
    rows = users.annotate(
        required=Exists(terms.subject_users(tenant).filter(pk=OuterRef("pk"))),
        has_current=has_current,
        has_any=Exists(mine),
        accepted_version=Subquery(latest.values("version__number")[:1]),
        accepted_at=Subquery(latest.values("accepted_at")[:1]),
    ).annotate(
        acceptance_status=Case(
            When(required=False, then=Value("not_required")),
            When(has_current=True, then=Value("accepted_current")),
            When(has_any=True, then=Value("accepted_older")),
            default=Value("never"),
            output_field=CharField(),
        ),
    )
    wanted = params.get("status")
    if wanted in ACCEPTANCE_STATUSES:
        rows = rows.filter(acceptance_status=wanted)
    version = params.get("version")
    if version and version.isdigit():
        rows = rows.filter(Exists(mine.filter(version__number=int(version))))
    search = (params.get("search") or "").strip()
    if search:
        rows = rows.filter(Q(email__icontains=search) | Q(name__icontains=search))
    return _ordered(rows, params.get("ordering", ""))


#: ``?ordering=`` values (prefix ``-`` for descending); empty values always last.
ACCEPTANCE_ORDERING = {
    "email": "email",
    "status": "acceptance_status",
    "accepted_version": "accepted_version",
    "accepted_at": "accepted_at",
}


def _ordered(rows, ordering: str):
    descending = ordering.startswith("-")
    field = ACCEPTANCE_ORDERING.get(ordering.lstrip("-"))
    if field is None:
        return rows.order_by("email", "pk")
    expression = (
        F(field).desc(nulls_last=True) if descending else F(field).asc(nulls_last=True)
    )
    return rows.order_by(expression, "email", "pk")


def paginated_rows(view: APIView, request: Request, rows) -> Response:
    paginator = AcceptancePagination()
    page = paginator.paginate_queryset(rows, request, view=view)
    data = [
        {
            "user": _person(user),
            "status": user.acceptance_status,
            "accepted_version": user.accepted_version,
            "accepted_at": user.accepted_at,
        }
        for user in page
    ]
    return paginator.get_paginated_response(
        AcceptanceRowSerializer(data, many=True).data,
    )


def acceptance_summary(tenant: Tenant, users=None) -> dict:
    """Current version, published version numbers and the acceptance counts."""
    current = terms.current_version(tenant)
    numbers = (
        TermsVersion.objects.filter(tenant=tenant)
        .exclude(status=TermsStatus.DRAFT)
        .order_by("-number")
        .values_list("number", flat=True)
    )
    return {
        "tenant_name": tenant.name,
        "current": TermsVersionSummarySerializer(current).data if current else None,
        "version_numbers": list(numbers),
        "current_stats": terms.acceptance_stats(tenant, users),
    }


class TermsAcceptanceListView(APIView):
    """
    Everyone connected to the Tenant and where they stand with its Terms:
    accepted the current version, an older one, never, or not required (suspended,
    inactive or superuser). Filters: ``status``, ``version`` (accepted that version),
    ``search`` (name/email). Paginated. Tenant administrators.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=AcceptanceRowSerializer(many=True))
    def get(self, request: Request, tenant_pk: str) -> Response:
        tenant = _managed_tenant(request, tenant_pk)
        rows = acceptance_rows(tenant, terms.tenant_users(tenant), request.query_params)
        return paginated_rows(self, request, rows)


class TermsAcceptanceSummaryView(APIView):
    """Counts and versions for the Tenant acceptance page (Tenant administrators)."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request, tenant_pk: str) -> Response:
        tenant = _managed_tenant(request, tenant_pk)
        return Response(acceptance_summary(tenant))


class _OrganizationTermsView(OrganizationScopedMixin, APIView):
    """
    The Tenant's Terms as they apply to one Organization's people. Readable by
    everyone who may see its members (``members.view`` — every role by default), like
    the Members and Permissions pages.
    """

    permission_classes = [IsAuthenticated]

    def check_access(self) -> None:
        self.ensure_visible()  # 404 without standing
        if not self.satisfies(VIEW_ACCESS):
            raise PermissionDenied

    def people(self):
        return terms.organization_users(self.organization)


class OrganizationTermsAcceptanceView(_OrganizationTermsView):
    @extend_schema(responses=AcceptanceRowSerializer(many=True))
    def get(self, request: Request, tenant_pk: str, organization_pk: str) -> Response:
        self.check_access()
        rows = acceptance_rows(self.tenant, self.people(), request.query_params)
        return paginated_rows(self, request, rows)


class OrganizationTermsSummaryView(_OrganizationTermsView):
    def get(self, request: Request, tenant_pk: str, organization_pk: str) -> Response:
        self.check_access()
        return Response(acceptance_summary(self.tenant, self.people()))
