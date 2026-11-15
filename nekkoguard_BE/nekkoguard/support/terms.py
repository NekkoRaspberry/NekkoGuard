"""
Tenant Terms of Service: who must accept, the version lifecycle and acceptances.

Policy (who must accept a Tenant's current Terms):
- every *active* user with an *active* membership in the (active) Tenant, or an
  active direct membership in one of its active Organizations;
- superusers are exempt (they reach every Tenant), and so is a superuser's
  read-only "view as" session;
- suspended memberships, inactive accounts and Tenants without published Terms
  require nothing.

A user who belongs to several Tenants accepts each Tenant's current version. A new
version always needs a new acceptance; acceptances of older versions stay recorded.
Publishing is atomic: the Tenant row is locked, the old current version is
superseded and the draft becomes current in one transaction (and the database
allows only one current version per Tenant).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.db import IntegrityError
from django.db import transaction
from django.db.models import Max
from django.db.models import Q
from django.db.models import QuerySet
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from rest_framework.exceptions import PermissionDenied
from rest_framework.exceptions import ValidationError

from nekkoguard.organizations.models import MembershipStatus
from nekkoguard.organizations.models import OrganizationMembership
from nekkoguard.organizations.models import Tenant
from nekkoguard.organizations.models import TenantMembership
from nekkoguard.organizations.services import record_activity
from nekkoguard.users.models import User

from . import content as files
from .document import clean_document
from .document import content_hash
from .document import document_from_sections
from .document import is_empty
from .models import TermsAcceptance
from .models import TermsStatus
from .models import TermsVersion

if TYPE_CHECKING:
    from typing import Any


# ---------------------------------------------------------------- who must accept


def is_exempt(user: User) -> bool:
    return bool(user.is_superuser)


def subject_tenant_ids(user: User) -> set:
    """Tenants whose current Terms this user must accept (see the policy above)."""
    if not user.is_authenticated or not user.is_active or is_exempt(user):
        return set()
    active = MembershipStatus.ACTIVE
    tenant_ids = set(
        TenantMembership.objects.filter(
            user=user,
            status=active,
            tenant__is_active=True,
        ).values_list("tenant_id", flat=True),
    )
    tenant_ids |= set(
        OrganizationMembership.objects.filter(
            user=user,
            status=active,
            organization__is_active=True,
            organization__tenant__is_active=True,
        ).values_list("organization__tenant_id", flat=True),
    )
    return tenant_ids


def subject_users(tenant: Tenant) -> QuerySet[User]:
    """Users who must accept this Tenant's current Terms."""
    active = MembershipStatus.ACTIVE
    return (
        User.objects.filter(is_active=True, is_superuser=False)
        .filter(
            Q(tenant_memberships__tenant=tenant, tenant_memberships__status=active)
            | Q(
                organization_memberships__organization__tenant=tenant,
                organization_memberships__organization__is_active=True,
                organization_memberships__status=active,
            ),
        )
        .distinct()
    )


def tenant_users(tenant: Tenant) -> QuerySet[User]:
    """Everyone connected to the Tenant (required or not): the acceptance overview."""
    return User.objects.filter(
        Q(tenant_memberships__tenant=tenant)
        | Q(organization_memberships__organization__tenant=tenant),
    ).distinct()


def organization_users(organization) -> QuerySet[User]:
    """Everyone connected to one Organization: its direct members and the Tenant
    members whose organization access reaches it (any status: suspended ones are
    shown as "not required")."""
    tenant_id = organization.tenant_id
    return User.objects.filter(
        Q(organization_memberships__organization=organization)
        | Q(
            tenant_memberships__tenant_id=tenant_id,
            tenant_memberships__organization_access="all",
        )
        | Q(
            tenant_memberships__tenant_id=tenant_id,
            tenant_memberships__organization_access="selected",
            tenant_memberships__organization_grants__organization=organization,
        ),
    ).distinct()


def acceptance_stats(tenant: Tenant, users: QuerySet[User] | None = None) -> dict:
    """Required / accepted / pending of the current version, optionally among users."""
    current = current_version(tenant)
    required = subject_users(tenant)
    if users is not None:
        required = required.filter(pk__in=users.values("pk"))
    total = required.count()
    if current is None:
        return {"required": total, "accepted": 0, "pending": 0}
    accepted = required.filter(terms_acceptances__version=current).count()
    return {"required": total, "accepted": accepted, "pending": total - accepted}


def pending_versions(user: User) -> QuerySet[TermsVersion]:
    """Current versions the user still has to accept (empty for exempt users)."""
    tenant_ids = subject_tenant_ids(user)
    if not tenant_ids:
        return TermsVersion.objects.none()
    return (
        TermsVersion.objects.filter(
            status=TermsStatus.CURRENT,
            tenant_id__in=tenant_ids,
        )
        .exclude(acceptances__user=user)
        .select_related("tenant")
        .order_by("tenant__name")
    )


def has_pending(user: User) -> bool:
    return pending_versions(user).exists()


# ---------------------------------------------------------------- lifecycle


def current_version(tenant: Tenant) -> TermsVersion | None:
    return TermsVersion.objects.filter(
        tenant=tenant,
        status=TermsStatus.CURRENT,
    ).first()


def draft_version(tenant: Tenant) -> TermsVersion | None:
    return TermsVersion.objects.filter(tenant=tenant, status=TermsStatus.DRAFT).first()


def _starting_point(tenant: Tenant) -> tuple[str, dict[str, Any]]:
    current = current_version(tenant)
    if current is not None:
        return current.title, current.content
    template = files.terms()
    return template["title"], document_from_sections(template["sections"])


def _audit(
    version: TermsVersion,
    actor: User | None,
    action: str,
    **details: Any,
) -> None:
    record_activity(
        tenant=version.tenant,
        actor=actor,
        action=action,
        target=version,
        details={
            "version": version.number,
            **({"content_hash": version.content_hash} if version.content_hash else {}),
            **details,
        },
    )


def create_draft(*, actor: User, tenant: Tenant) -> TermsVersion:
    """New draft from the current version (or the starting template)."""
    title, document = _starting_point(tenant)
    try:
        with transaction.atomic():
            draft = TermsVersion.objects.create(
                tenant=tenant,
                title=title,
                content=document,
                created_by=actor,
                updated_by=actor,
            )
    except IntegrityError:
        raise ValidationError(
            {"detail": _("There is already a draft. Edit or discard it first.")},
        ) from None
    _audit(draft, actor, "terms.draft_created")
    return draft


def _clean_title(title: Any) -> str:
    if not isinstance(title, str) or not title.strip():
        raise ValidationError({"title": [_("Give the Terms of Service a title.")]})
    title = " ".join(title.split())
    if len(title) > 150:  # noqa: PLR2004
        raise ValidationError({"title": [_("The title is too long (max 150).")]})
    return title


def update_draft(
    *,
    actor: User,
    draft: TermsVersion,
    title: Any = None,
    content: Any = None,
) -> TermsVersion:
    with transaction.atomic():
        draft = TermsVersion.objects.select_for_update().get(pk=draft.pk)
        if draft.status != TermsStatus.DRAFT:
            raise PermissionDenied(_("Published Terms of Service cannot be changed."))
        changed = []
        if title is not None:
            draft.title = _clean_title(title)
            changed.append("title")
        if content is not None:
            draft.content = clean_document(content)
            changed.append("content")
        if not changed:
            return draft
        draft.updated_by = actor
        draft.save(update_fields=[*changed, "updated_by", "updated_at"])
    _audit(draft, actor, "terms.draft_updated", fields=changed)
    return draft


def discard_draft(*, actor: User, draft: TermsVersion) -> None:
    with transaction.atomic():
        draft = TermsVersion.objects.select_for_update().get(pk=draft.pk)
        if draft.status != TermsStatus.DRAFT:
            raise PermissionDenied(_("Published Terms of Service cannot be deleted."))
        _audit(draft, actor, "terms.draft_discarded")
        draft.delete()


def publish(*, actor: User, draft: TermsVersion) -> TermsVersion:
    """Draft → current; the previous current version → superseded. Atomic."""
    with transaction.atomic():
        # Serializes concurrent publishes of the same Tenant.
        Tenant.objects.select_for_update().get(pk=draft.tenant_id)
        draft = TermsVersion.objects.select_for_update().get(pk=draft.pk)
        if draft.status != TermsStatus.DRAFT:
            raise ValidationError({"detail": _("This version is already published.")})
        title = _clean_title(draft.title)
        document = clean_document(draft.content)
        if is_empty(document):
            raise ValidationError({"content": [_("The Terms of Service are empty.")]})
        now = timezone.now()
        previous = (
            TermsVersion.objects.select_for_update()
            .filter(tenant_id=draft.tenant_id, status=TermsStatus.CURRENT)
            .first()
        )
        if previous is not None:
            previous.status = TermsStatus.SUPERSEDED
            previous.superseded_at = now
            previous.save(update_fields=["status", "superseded_at", "updated_at"])
        last = TermsVersion.objects.filter(tenant_id=draft.tenant_id).aggregate(
            n=Max("number"),
        )["n"]
        draft.title = title
        draft.content = document
        draft.number = (last or 0) + 1
        draft.content_hash = content_hash(title, document)
        draft.status = TermsStatus.CURRENT
        draft.published_by = actor
        draft.published_at = now
        draft.effective_date = timezone.localdate(now)
        draft.updated_by = actor
        draft.save()
        if previous is not None:
            _audit(previous, actor, "terms.superseded", superseded_by=draft.number)
        _audit(draft, actor, "terms.published")
    return draft


# ---------------------------------------------------------------- acceptance


def accept(
    *,
    user: User,
    version: TermsVersion,
    user_agent: str = "",
) -> TermsAcceptance:
    """Record the acceptance of the *current* version of one of the user's Tenants."""
    if version.status != TermsStatus.CURRENT:
        raise ValidationError(
            {
                "detail": _(
                    "These Terms are no longer current. Reload to see the new version.",
                ),
            },
        )
    if version.tenant_id not in subject_tenant_ids(user):
        raise PermissionDenied(_("These Terms do not apply to you."))
    existing = TermsAcceptance.objects.filter(user=user, version=version).first()
    if existing is not None:
        return existing
    try:
        with transaction.atomic():
            acceptance = TermsAcceptance.objects.create(
                tenant=version.tenant,
                user=user,
                user_email=user.email,
                version=version,
                content_hash=version.content_hash,
                user_agent=" ".join((user_agent or "").split())[:300],
            )
    except IntegrityError:  # the same acceptance from another tab, at the same time
        return TermsAcceptance.objects.get(user=user, version=version)
    _audit(version, user, "terms.accepted")
    return acceptance


def record_decline(*, user: User) -> None:
    """Audit a refusal for each pending Tenant (no acceptance is recorded)."""
    for version in pending_versions(user):
        _audit(version, user, "terms.declined")
