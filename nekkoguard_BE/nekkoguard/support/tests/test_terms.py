import pytest
from django.db import IntegrityError
from django.db import transaction
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from nekkoguard.organizations.models import ActivityEntry
from nekkoguard.organizations.roles import OrganizationAccess
from nekkoguard.organizations.roles import TenantRole
from nekkoguard.organizations.tests.factories import OrganizationFactory
from nekkoguard.organizations.tests.factories import OrganizationMembershipFactory
from nekkoguard.organizations.tests.factories import TenantFactory
from nekkoguard.organizations.tests.factories import TenantMembershipFactory
from nekkoguard.support import terms
from nekkoguard.support.document import clean_document
from nekkoguard.support.document import content_hash
from nekkoguard.support.middleware import TERMS_REQUIRED_CODE
from nekkoguard.support.models import PublishedTermsAreImmutableError
from nekkoguard.support.models import TermsAcceptance
from nekkoguard.support.models import TermsStatus
from nekkoguard.support.models import TermsVersion
from nekkoguard.users.tests.factories import UserFactory

pytestmark = pytest.mark.django_db

DOC = {
    "type": "doc",
    "content": [
        {
            "type": "heading",
            "attrs": {"level": 1, "id": "intro"},
            "content": [{"type": "text", "text": "Introduction"}],
        },
        {"type": "paragraph", "content": [{"type": "text", "text": "Hello."}]},
    ],
}


def client_for(user):
    client = APIClient()
    client.force_login(user)  # a real session: the middleware sees the user
    return client


def admin_of(tenant):
    user = UserFactory()
    TenantMembershipFactory(
        tenant=tenant,
        user=user,
        role=TenantRole.ADMIN,
        organization_access=OrganizationAccess.ALL,
    )
    return user


def member_of(tenant, **extra):
    user = UserFactory()
    TenantMembershipFactory(tenant=tenant, user=user, **extra)
    return user


def published(tenant, admin, document=DOC):
    draft = terms.create_draft(actor=admin, tenant=tenant)
    terms.update_draft(actor=admin, draft=draft, content=document)
    return terms.publish(actor=admin, draft=draft)


def base(tenant):
    return f"/api/tenants/{tenant.pk}/terms/"


# ---------------------------------------------------------------- document safety


class TestDocument:
    def test_unsafe_links_are_refused(self):
        for href in [
            "javascript:alert(1)",
            "data:text/html,x",
            " vbscript:x",
            "#Bad Id",
        ]:
            doc = {
                "type": "doc",
                "content": [
                    {
                        "type": "paragraph",
                        "content": [
                            {
                                "type": "text",
                                "text": "x",
                                "marks": [{"type": "link", "attrs": {"href": href}}],
                            },
                        ],
                    },
                ],
            }
            with pytest.raises(ValidationError):
                clean_document(doc)

    def test_safe_links_keep_only_href(self):
        doc = clean_document(
            {
                "type": "doc",
                "content": [
                    {
                        "type": "paragraph",
                        "content": [
                            {
                                "type": "text",
                                "text": "x",
                                "marks": [
                                    {
                                        "type": "link",
                                        "attrs": {
                                            "href": "https://example.com",
                                            "target": "_blank",
                                            "onclick": "evil()",
                                        },
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
        )
        mark = doc["content"][0]["content"][0]["marks"][0]
        assert mark == {"type": "link", "attrs": {"href": "https://example.com"}}

    @pytest.mark.parametrize("kind", ["script", "iframe", "image", "codeBlock"])
    def test_unknown_nodes_are_refused(self, kind):
        with pytest.raises(ValidationError):
            clean_document({"type": "doc", "content": [{"type": kind}]})

    def test_heading_ids_are_unique_and_stable(self):
        doc = clean_document(
            {
                "type": "doc",
                "content": [
                    {
                        "type": "heading",
                        "attrs": {"level": 1},
                        "content": [{"type": "text", "text": "Scope of Service"}],
                    },
                    {
                        "type": "heading",
                        "attrs": {"level": 2, "id": "scope-of-service"},
                        "content": [{"type": "text", "text": "Other"}],
                    },
                ],
            },
        )
        ids = [node["attrs"]["id"] for node in doc["content"]]
        assert ids == ["scope-of-service", "scope-of-service-2"]
        assert clean_document(doc) == doc  # idempotent: ids survive re-saving

    def test_unknown_attributes_are_dropped(self):
        doc = clean_document(
            {
                "type": "doc",
                "content": [
                    {
                        "type": "paragraph",
                        "attrs": {"textAlign": "center", "style": "x", "class": "y"},
                    },
                ],
            },
        )
        assert doc["content"][0]["attrs"] == {"textAlign": "center"}


# ---------------------------------------------------------------- lifecycle


class TestLifecycle:
    def test_first_draft_starts_from_the_template(self):
        tenant = TenantFactory()
        draft = terms.create_draft(actor=admin_of(tenant), tenant=tenant)
        assert draft.status == TermsStatus.DRAFT
        assert draft.number is None
        headings = [n for n in draft.content["content"] if n["type"] == "heading"]
        assert headings[0]["attrs"]["id"] == "acceptance"

    def test_publish_numbers_hashes_and_supersedes(self):
        tenant = TenantFactory()
        admin = admin_of(tenant)
        first = published(tenant, admin)
        assert (first.number, first.status) == (1, TermsStatus.CURRENT)
        assert first.content_hash == content_hash(first.title, first.content)
        second = published(tenant, admin)
        first.refresh_from_db()
        assert (second.number, second.status) == (2, TermsStatus.CURRENT)
        assert first.status == TermsStatus.SUPERSEDED
        assert first.superseded_at is not None
        # A new draft starts from the current text.
        draft = terms.create_draft(actor=admin, tenant=tenant)
        assert draft.content == second.content

    def test_one_draft_per_tenant(self):
        tenant = TenantFactory()
        admin = admin_of(tenant)
        terms.create_draft(actor=admin, tenant=tenant)
        with pytest.raises(ValidationError):
            terms.create_draft(actor=admin, tenant=tenant)

    def test_database_allows_one_current_version_per_tenant(self):
        tenant = TenantFactory()
        version = published(tenant, admin_of(tenant))
        with pytest.raises(IntegrityError), transaction.atomic():
            TermsVersion.objects.create(
                tenant=tenant,
                number=99,
                title="x",
                content=DOC,
                content_hash="x" * 64,
                status=TermsStatus.CURRENT,
                published_at=version.published_at,
            )

    def test_publishing_the_same_draft_twice_fails(self):
        tenant = TenantFactory()
        admin = admin_of(tenant)
        draft = terms.create_draft(actor=admin, tenant=tenant)
        stale = TermsVersion.objects.get(pk=draft.pk)
        terms.publish(actor=admin, draft=draft)
        with pytest.raises(ValidationError):
            terms.publish(actor=admin, draft=stale)
        assert TermsVersion.objects.filter(tenant=tenant, status="current").count() == 1

    def test_published_versions_are_immutable(self):
        tenant = TenantFactory()
        version = published(tenant, admin_of(tenant))
        version.title = "Changed"
        with pytest.raises(PublishedTermsAreImmutableError):
            version.save()
        with pytest.raises(PublishedTermsAreImmutableError):
            TermsVersion.objects.get(pk=version.pk).delete()

    def test_empty_terms_cannot_be_published(self):
        tenant = TenantFactory()
        admin = admin_of(tenant)
        draft = terms.create_draft(actor=admin, tenant=tenant)
        terms.update_draft(
            actor=admin,
            draft=draft,
            content={"type": "doc", "content": []},
        )
        with pytest.raises(ValidationError):
            terms.publish(actor=admin, draft=draft)

    def test_lifecycle_is_audited(self):
        tenant = TenantFactory()
        admin = admin_of(tenant)
        published(tenant, admin)
        published(tenant, admin)
        actions = list(
            ActivityEntry.objects.filter(tenant=tenant)
            .order_by("created_at", "id")
            .values_list("action", flat=True),
        )
        assert actions.count("terms.published") == 2  # noqa: PLR2004
        assert "terms.superseded" in actions
        assert "terms.draft_created" in actions
        entry = ActivityEntry.objects.filter(action="terms.published").last()
        assert entry.details["content_hash"]


# ---------------------------------------------------------------- management API


class TestManagementApi:
    def test_admin_creates_edits_previews_and_publishes(self):
        tenant = TenantFactory()
        client = client_for(admin_of(tenant))
        draft = client.post(f"{base(tenant)}versions/")
        assert draft.status_code == status.HTTP_201_CREATED
        url = f"{base(tenant)}versions/{draft.data['id']}/"
        saved = client.patch(url, {"title": "Our terms", "content": DOC}, format="json")
        assert saved.status_code == status.HTTP_200_OK
        assert client.get(url).data["content"] == DOC  # preview data
        done = client.post(f"{url}publish/")
        assert done.status_code == status.HTTP_200_OK
        assert done.data["number"] == 1
        # Published: read-only.
        assert client.patch(url, {"title": "x"}, format="json").status_code == 403  # noqa: PLR2004
        assert client.delete(url).status_code == status.HTTP_403_FORBIDDEN

    def test_drafts_can_be_discarded(self):
        tenant = TenantFactory()
        client = client_for(admin_of(tenant))
        draft = client.post(f"{base(tenant)}versions/").data
        response = client.delete(f"{base(tenant)}versions/{draft['id']}/")
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not TermsVersion.objects.filter(pk=draft["id"]).exists()

    def test_invalid_documents_are_refused(self):
        tenant = TenantFactory()
        client = client_for(admin_of(tenant))
        draft = client.post(f"{base(tenant)}versions/").data
        bad = {"type": "doc", "content": [{"type": "script"}]}
        response = client.patch(
            f"{base(tenant)}versions/{draft['id']}/",
            {"content": bad},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_members_cannot_manage(self):
        tenant = TenantFactory()
        client = client_for(member_of(tenant))
        assert client.get(f"{base(tenant)}versions/").status_code == 403  # noqa: PLR2004
        assert client.post(f"{base(tenant)}versions/").status_code == 403  # noqa: PLR2004
        assert client.get(f"{base(tenant)}acceptances/").status_code == 403  # noqa: PLR2004
        assert client.get(base(tenant)).data["can_manage"] is False

    @pytest.mark.parametrize(
        "organization_access",
        [OrganizationAccess.SELECTED, OrganizationAccess.NONE],
    )
    def test_any_tenant_administrator_manages_them(self, organization_access):
        # A Tenant setting: organization access does not matter.
        tenant = TenantFactory()
        org = OrganizationFactory(tenant=tenant)
        admin = UserFactory()
        membership = TenantMembershipFactory(
            tenant=tenant,
            user=admin,
            role=TenantRole.ADMIN,
            organization_access=organization_access,
        )
        if organization_access == OrganizationAccess.SELECTED:
            membership.organization_grants.create(organization=org)
        client = client_for(admin)
        assert client.get(base(tenant)).data["can_manage"] is True
        draft = client.post(f"{base(tenant)}versions/")
        assert draft.status_code == status.HTTP_201_CREATED
        publish = client.post(f"{base(tenant)}versions/{draft.data['id']}/publish/")
        assert publish.status_code == status.HTTP_200_OK
        # Publishing binds the administrator too: blocked until they accept.
        blocked = client.get(f"{base(tenant)}acceptances/")
        assert blocked.status_code == status.HTTP_403_FORBIDDEN
        client.post(f"/api/terms/{publish.data['id']}/accept/")
        assert client.get(f"{base(tenant)}acceptances/").status_code == 200  # noqa: PLR2004

    def test_other_tenants_are_not_visible(self):
        tenant_a, tenant_b = TenantFactory(), TenantFactory()
        version_b = published(tenant_b, admin_of(tenant_b))
        client = client_for(admin_of(tenant_a))
        assert client.get(base(tenant_b)).status_code == status.HTTP_404_NOT_FOUND
        assert client.get(f"{base(tenant_b)}versions/").status_code == 404  # noqa: PLR2004
        # Another Tenant's version through this Tenant's URL: not found either.
        url = f"{base(tenant_a)}versions/{version_b.pk}/"
        assert client.get(url).status_code == status.HTTP_404_NOT_FOUND

    def test_members_read_the_current_terms(self):
        tenant = TenantFactory()
        version = published(tenant, admin_of(tenant))
        user = member_of(tenant)
        TermsAcceptance.objects.create(
            tenant=tenant,
            user=user,
            user_email=user.email,
            version=version,
            content_hash=version.content_hash,
        )
        response = client_for(user).get(base(tenant))
        assert response.status_code == status.HTTP_200_OK
        assert response.data["current"]["number"] == 1
        assert response.data["accepted_at"] is not None
        assert response.data["can_manage"] is False


# ---------------------------------------------------------------- enforcement


class TestEnforcement:
    def test_pending_terms_block_the_api_until_accepted(self):
        tenant = TenantFactory()
        version = published(tenant, admin_of(tenant))
        user = member_of(tenant)
        client = client_for(user)
        blocked = client.get("/api/tenants/")
        assert blocked.status_code == status.HTTP_403_FORBIDDEN
        assert blocked.json()["code"] == TERMS_REQUIRED_CODE
        # What the acceptance screen needs stays reachable.
        assert client.get("/api/users/me/").status_code == status.HTTP_200_OK
        pending = client.get("/api/terms/pending/")
        assert [v["id"] for v in pending.data] == [str(version.pk)]
        accepted = client.post(f"/api/terms/{version.pk}/accept/")
        assert accepted.status_code == status.HTTP_200_OK
        assert accepted.data["pending"] == 0
        assert client.get("/api/tenants/").status_code == status.HTTP_200_OK
        record = TermsAcceptance.objects.get(user=user)
        assert record.content_hash == version.content_hash
        assert ActivityEntry.objects.filter(
            action="terms.accepted",
            actor=user,
        ).exists()

    def test_accepting_twice_keeps_one_record(self):
        tenant = TenantFactory()
        version = published(tenant, admin_of(tenant))
        client = client_for(member_of(tenant))
        client.post(f"/api/terms/{version.pk}/accept/")
        client.post(f"/api/terms/{version.pk}/accept/")
        assert TermsAcceptance.objects.filter(version=version).count() == 1

    def test_a_new_version_needs_a_new_acceptance(self):
        tenant = TenantFactory()
        admin = admin_of(tenant)
        first = published(tenant, admin)
        user = member_of(tenant)
        terms.accept(user=user, version=first)
        assert not terms.has_pending(user)
        second = published(tenant, admin)
        client = client_for(user)
        assert client.get("/api/tenants/").status_code == status.HTTP_403_FORBIDDEN
        # The old version can no longer be accepted; the old record is kept.
        stale = client.post(f"/api/terms/{first.pk}/accept/")
        assert stale.status_code == status.HTTP_400_BAD_REQUEST
        client.post(f"/api/terms/{second.pk}/accept/")
        versions = set(
            TermsAcceptance.objects.filter(user=user).values_list(
                "version__number",
                flat=True,
            ),
        )
        assert versions == {1, 2}

    def test_every_tenant_of_the_user_must_be_accepted(self):
        tenant_a, tenant_b = TenantFactory(), TenantFactory()
        version_a = published(tenant_a, admin_of(tenant_a))
        version_b = published(tenant_b, admin_of(tenant_b))
        user = member_of(tenant_a)
        OrganizationMembershipFactory(
            organization=OrganizationFactory(tenant=tenant_b),
            user=user,
        )  # reaches Tenant B through a direct organization membership
        assert set(terms.pending_versions(user)) == {version_a, version_b}
        terms.accept(user=user, version=version_a)
        assert list(terms.pending_versions(user)) == [version_b]

    def test_another_tenants_terms_cannot_be_accepted(self):
        tenant_a, tenant_b = TenantFactory(), TenantFactory()
        published(tenant_a, admin_of(tenant_a))
        version_b = published(tenant_b, admin_of(tenant_b))
        client = client_for(member_of(tenant_a))
        response = client.post(f"/api/terms/{version_b.pk}/accept/")
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert not TermsAcceptance.objects.filter(version=version_b).exists()

    def test_who_is_not_required(self):
        tenant = TenantFactory()
        published(tenant, admin_of(tenant))
        suspended = member_of(tenant, status="suspended")
        superuser = UserFactory(is_superuser=True, is_staff=True)
        TenantMembershipFactory(tenant=tenant, user=superuser)
        without_terms = member_of(TenantFactory())
        for user in (suspended, superuser, without_terms):
            assert not terms.has_pending(user)
            assert client_for(user).get("/api/tenants/").status_code == 200  # noqa: PLR2004

    def test_token_clients_are_blocked_too(self):
        tenant = TenantFactory()
        published(tenant, admin_of(tenant))
        user = member_of(tenant)
        token = Token.objects.create(user=user)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        response = client.get("/api/tenants/")
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert response.json()["code"] == TERMS_REQUIRED_CODE

    def test_declining_signs_out_without_accepting(self):
        tenant = TenantFactory()
        version = published(tenant, admin_of(tenant))
        user = member_of(tenant)
        client = client_for(user)
        response = client.post("/api/terms/decline/")
        assert response.status_code == status.HTTP_200_OK
        assert client.get("/api/users/me/").status_code == status.HTTP_403_FORBIDDEN
        assert not TermsAcceptance.objects.filter(version=version).exists()
        assert ActivityEntry.objects.filter(
            action="terms.declined",
            actor=user,
        ).exists()


class TestAcceptanceOverview:
    def test_statuses_and_counts(self):
        tenant = TenantFactory()
        admin = admin_of(tenant)
        first = published(tenant, admin)
        older = member_of(tenant)
        terms.accept(user=older, version=first)
        second = published(tenant, admin)
        current = member_of(tenant)
        terms.accept(user=current, version=second)
        never = member_of(tenant)
        suspended = member_of(tenant, status="suspended")
        client = client_for(admin)
        terms.accept(user=admin, version=second)

        rows = client.get(f"{base(tenant)}acceptances/").data["results"]
        by_email = {row["user"]["email"]: row for row in rows}
        assert by_email[older.email]["status"] == "accepted_older"
        assert by_email[older.email]["accepted_version"] == 1
        assert by_email[current.email]["status"] == "accepted_current"
        assert by_email[never.email]["status"] == "never"
        assert by_email[suspended.email]["status"] == "not_required"

        only_never = client.get(f"{base(tenant)}acceptances/?status=never").data
        assert [r["user"]["email"] for r in only_never["results"]] == [never.email]
        by_version = client.get(f"{base(tenant)}acceptances/?version=1").data["results"]
        assert [r["user"]["email"] for r in by_version] == [older.email]

        stats = client.get(f"{base(tenant)}versions/").data
        assert stats["current_stats"] == {"required": 4, "accepted": 2, "pending": 2}
        counts = {v["number"]: v["accepted_count"] for v in stats["versions"]}
        assert counts == {2: 2, 1: 1}


class TestOrganizationAcceptance:
    """Settings > Organization > Terms of Service: only that organization's people."""

    def setup_world(self):
        tenant = TenantFactory()
        admin = admin_of(tenant)  # access: all organizations
        org_a = OrganizationFactory(tenant=tenant)
        org_b = OrganizationFactory(tenant=tenant)
        version = published(tenant, admin)
        terms.accept(user=admin, version=version)
        viewer = UserFactory()
        OrganizationMembershipFactory(organization=org_a, user=viewer)  # direct Viewer
        terms.accept(user=viewer, version=version)
        only_b = UserFactory()
        OrganizationMembershipFactory(organization=org_b, user=only_b)
        terms.accept(user=only_b, version=version)
        pending = UserFactory()
        OrganizationMembershipFactory(organization=org_a, user=pending)
        return tenant, org_a, admin, viewer, only_b, pending

    def url(self, org, path):
        return f"/api/tenants/{org.tenant_id}/organizations/{org.pk}/terms/{path}"

    def test_lists_only_the_organizations_people(self):
        _tenant, org_a, admin, viewer, only_b, pending = self.setup_world()
        rows = client_for(viewer).get(self.url(org_a, "acceptances/")).data["results"]
        emails = {row["user"]["email"]: row["status"] for row in rows}
        assert emails == {
            admin.email: "accepted_current",  # reaches A through the Tenant
            viewer.email: "accepted_current",
            pending.email: "never",
        }
        assert only_b.email not in emails

    def test_summary_counts_the_organization_only(self):
        _tenant, org_a, _admin, viewer, _only_b, _pending = self.setup_world()
        summary = client_for(viewer).get(self.url(org_a, "summary/")).data
        assert summary["current_stats"] == {"required": 3, "accepted": 2, "pending": 1}
        assert summary["version_numbers"] == [1]
        assert summary["current"]["number"] == 1

    def test_everyone_in_the_organization_can_see_it_but_nobody_else(self):
        _tenant, org_a, _admin, viewer, only_b, _pending = self.setup_world()
        response = client_for(viewer).get(self.url(org_a, "acceptances/"))
        assert response.status_code == status.HTTP_200_OK
        # A member of another organization of the same Tenant: no standing in A.
        response = client_for(only_b).get(self.url(org_a, "acceptances/"))
        assert response.status_code == status.HTTP_404_NOT_FOUND
        outsider = admin_of(TenantFactory())
        response = client_for(outsider).get(self.url(org_a, "summary/"))
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_members_view_can_be_denied(self):
        _tenant, org_a, _admin, viewer, _only_b, _pending = self.setup_world()
        from nekkoguard.organizations.models import PermissionOverride  # noqa: PLC0415
        from nekkoguard.organizations.roles import Effect  # noqa: PLC0415
        from nekkoguard.organizations.roles import Permission  # noqa: PLC0415

        PermissionOverride.objects.create(
            organization=org_a,
            user=viewer,
            permission=Permission.VIEW_MEMBERS,
            effect=Effect.DENY,
        )
        response = client_for(viewer).get(self.url(org_a, "acceptances/"))
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_tenant_summary_is_for_tenant_administrators(self):
        tenant, _org_a, admin, viewer, _only_b, _pending = self.setup_world()
        url = f"/api/tenants/{tenant.pk}/terms/summary/"
        assert client_for(admin).get(url).data["current_stats"]["required"] == 4  # noqa: PLR2004
        # Sees the Tenant (organization member) but does not administer it.
        assert client_for(viewer).get(url).status_code == status.HTTP_403_FORBIDDEN


class TestHistoryForMembers:
    def test_members_read_published_versions_but_not_drafts_or_counts(self):
        tenant = TenantFactory()
        admin = admin_of(tenant)
        first = published(tenant, admin)
        terms.create_draft(actor=admin, tenant=tenant)
        draft = terms.draft_version(tenant)
        member = member_of(tenant)
        terms.accept(user=member, version=first)
        client = client_for(member)
        rows = client.get(f"{base(tenant)}history/").data
        assert [row["number"] for row in rows] == [1]
        assert "accepted_count" not in rows[0]
        detail = client.get(f"{base(tenant)}history/{first.pk}/")
        assert detail.status_code == status.HTTP_200_OK
        assert detail.data["content"] == first.content
        hidden = client.get(f"{base(tenant)}history/{draft.pk}/")
        assert hidden.status_code == status.HTTP_404_NOT_FOUND

    def test_other_tenants_history_is_not_found(self):
        tenant = TenantFactory()
        version = published(tenant, admin_of(tenant))
        outsider = admin_of(TenantFactory())
        client = client_for(outsider)
        assert client.get(f"{base(tenant)}history/").status_code == 404  # noqa: PLR2004
        url = f"{base(tenant)}history/{version.pk}/"
        assert client.get(url).status_code == status.HTTP_404_NOT_FOUND


class TestAcceptanceOrdering:
    def test_sorted_server_side_with_empty_values_last(self):
        tenant = TenantFactory()
        admin = admin_of(tenant)
        version = published(tenant, admin)
        terms.accept(user=admin, version=version)
        early = member_of(tenant)
        terms.accept(user=early, version=version)
        never = member_of(tenant)
        client = client_for(admin)
        url = f"{base(tenant)}acceptances/?ordering="
        newest = [
            r["user"]["email"] for r in client.get(f"{url}-accepted_at").data["results"]
        ]
        assert newest[0] == early.email
        assert newest[-1] == never.email  # never accepted: last either way
        oldest = [
            r["user"]["email"] for r in client.get(f"{url}accepted_at").data["results"]
        ]
        assert oldest[0] == admin.email
        assert oldest[-1] == never.email
        by_status = client.get(f"{url}status").data["results"]
        assert [r["status"] for r in by_status] == sorted(
            r["status"] for r in by_status
        )
