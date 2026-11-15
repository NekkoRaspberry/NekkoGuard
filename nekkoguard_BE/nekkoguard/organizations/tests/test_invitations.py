"""Add member by email: direct add for existing accounts, invitations otherwise."""

from __future__ import annotations

import re
from datetime import timedelta

import pytest
from allauth.account.models import EmailAddress
from allauth.account.signals import email_confirmed
from django.core.cache import cache
from django.utils import timezone
from rest_framework import status

from nekkoguard.organizations import invitations
from nekkoguard.organizations.models import ActivityEntry
from nekkoguard.organizations.models import InvitationStatus
from nekkoguard.organizations.models import OrganizationInvitation
from nekkoguard.organizations.models import OrganizationMembership
from nekkoguard.organizations.roles import OrganizationRole
from nekkoguard.users.adapters import AccountAdapter
from nekkoguard.users.tests.factories import UserFactory

from .conftest import api_client
from .test_api import o_url

NEW_EMAIL = "new.person@company.example"
LINK = re.compile(r"/invitations/([A-Za-z0-9_-]+)")


@pytest.fixture(autouse=True)
def _clear_throttles():
    cache.clear()  # throttle counters live in the cache


@pytest.fixture
def invite(world, django_capture_on_commit_callbacks, mailoutbox):
    """Invite NEW_EMAIL to A1 as the Tenant admin; returns (response, token)."""

    def run(email: str = NEW_EMAIL, who: str = "john", org=None):
        with django_capture_on_commit_callbacks(execute=True):
            response = world.client(who).post(
                o_url(org or world.a1, "members/"),
                {"email": email},
            )
        tokens = LINK.findall(mailoutbox[-1].body) if mailoutbox else []
        return response, (tokens[-1] if tokens else None)

    return run


def verified_user(email: str):
    user = UserFactory(email=email)
    EmailAddress.objects.create(user=user, email=email, verified=True, primary=True)
    return user


class TestAddExistingUser:
    def test_existing_account_is_added_as_viewer_without_email(
        self,
        world,
        invite,
        mailoutbox,
    ):
        response, _ = invite(world.users["peter"].email.upper())
        assert response.status_code == status.HTTP_201_CREATED, response.data
        assert response.data["result"] == "added"
        assert response.data["membership"]["role"] == OrganizationRole.VIEWER
        assert mailoutbox == []
        assert not OrganizationInvitation.objects.exists()

    def test_existing_member_gets_a_clear_message(self, world, invite):
        invite(world.users["peter"].email)
        response, _ = invite(world.users["peter"].email)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "already a member" in str(response.data["email"])
        # A2 (from the test world) and A1 — no duplicate.
        memberships = OrganizationMembership.objects.filter(user=world.peter)
        assert sorted(m.organization.name for m in memberships) == ["A1", "A2"]

    def test_role_in_request_is_ignored(self, world):
        response = world.client("john").post(
            o_url(world.a1, "members/"),
            {"email": world.users["peter"].email, "role": "owner"},
        )
        assert response.data["membership"]["role"] == OrganizationRole.VIEWER


class TestInvite:
    def test_unknown_email_creates_invitation_and_sends_email(
        self,
        world,
        invite,
        mailoutbox,
    ):
        response, token = invite(NEW_EMAIL.upper())
        assert response.status_code == status.HTTP_201_CREATED, response.data
        assert response.data["result"] == "invited"
        assert response.data["invitation"]["status"] == "pending"
        assert "token" not in response.data["invitation"]

        invitation = OrganizationInvitation.objects.get()
        assert invitation.email == NEW_EMAIL
        assert invitation.role == OrganizationRole.VIEWER
        assert invitation.invited_by == world.john
        # Only the hash is stored.
        assert token
        assert invitation.token_hash == invitations.hash_token(token)
        assert token not in invitation.token_hash

        (mail,) = mailoutbox
        assert mail.to == [NEW_EMAIL]
        assert mail.subject == "You've been invited to join A1 on NekkoGuard"
        html, mime = mail.alternatives[0]
        assert mime == "text/html"
        assert "Accept invitation" in html
        for body in (mail.body, html):
            assert str(world.a1.pk) not in body
            assert str(invitation.pk) not in body
            assert invitation.token_hash not in body

    def test_no_duplicate_pending_invitation(self, world, invite):
        invite()
        response, _ = invite()
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert OrganizationInvitation.objects.count() == 1

    def test_expired_invitation_is_replaced(self, world, invite):
        invite()
        OrganizationInvitation.objects.update(
            expires_at=timezone.now() - timedelta(minutes=1),
        )
        response, _ = invite()
        assert response.status_code == status.HTTP_201_CREATED
        statuses = sorted(
            OrganizationInvitation.objects.values_list("status", flat=True),
        )
        assert statuses == [InvitationStatus.EXPIRED, InvitationStatus.PENDING]

    def test_same_email_may_be_invited_to_another_organization(self, world, invite):
        invite()
        response, _ = invite(org=world.a2)
        assert response.status_code == status.HTTP_201_CREATED

    def test_requires_member_management_rights(self, world, invite):
        response, _ = invite(who="mary")  # operator in A1
        assert response.status_code == status.HTTP_403_FORBIDDEN
        response, _ = invite(who="outsider")
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert not OrganizationInvitation.objects.exists()

    def test_creation_is_audited_without_secrets(self, world, invite):
        _, token = invite()
        entry = ActivityEntry.objects.get(action="organization_invitation.created")
        assert entry.target_name == NEW_EMAIL
        assert token not in str(entry.details)


class TestManageInvitations:
    def test_list_shows_open_invitations_only(self, world, invite):
        invite()
        url = o_url(world.a1, "invitations/")
        assert [i["email"] for i in world.client("john").get(url).data] == [NEW_EMAIL]
        # Every role may read the list (members.view)…
        assert [i["email"] for i in world.client("mary").get(url).data] == [NEW_EMAIL]
        # …and nobody without standing.
        assert world.client("david").get(url).status_code == status.HTTP_404_NOT_FOUND
        # Another Organization's invitations are not visible here.
        assert world.client("john").get(o_url(world.a2, "invitations/")).data == []

    def test_resend_rotates_the_token(
        self,
        world,
        invite,
        mailoutbox,
        django_capture_on_commit_callbacks,
    ):
        _, old = invite()
        invitation = OrganizationInvitation.objects.get()
        with django_capture_on_commit_callbacks(execute=True):
            response = world.client("john").post(
                o_url(world.a1, f"invitations/{invitation.pk}/resend/"),
            )
        assert response.status_code == status.HTTP_200_OK, response.data
        new = LINK.findall(mailoutbox[-1].body)[-1]
        assert new != old
        anon = api_client()
        gone = anon.get(f"/api/invitations/{old}/")
        assert gone.status_code == status.HTTP_404_NOT_FOUND
        assert anon.get(f"/api/invitations/{new}/").data["status"] == "pending"

    def test_resend_is_scoped_to_the_url_organization(self, world, invite):
        invite()
        invitation = OrganizationInvitation.objects.get()
        response = world.client("john").post(
            o_url(world.a2, f"invitations/{invitation.pk}/resend/"),
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_revoke(self, world, invite):
        _, token = invite()
        invitation = OrganizationInvitation.objects.get()
        url = o_url(world.a1, f"invitations/{invitation.pk}/")
        response = world.client("john").delete(url)
        assert response.status_code == status.HTTP_204_NO_CONTENT
        invitation.refresh_from_db()
        assert invitation.status == InvitationStatus.REVOKED
        assert api_client().get(f"/api/invitations/{token}/").data == {
            "status": "revoked",
        }
        user = verified_user(NEW_EMAIL)
        response = api_client(user).post(f"/api/invitations/{token}/accept/")
        assert response.status_code == status.HTTP_400_BAD_REQUEST


class TestAccept:
    def test_preview_shows_organization_and_inviter_only_while_pending(
        self,
        world,
        invite,
    ):
        _, token = invite()
        data = api_client().get(f"/api/invitations/{token}/").data
        assert data["organization_name"] == "A1"
        assert data["email"] == NEW_EMAIL
        assert "organization" not in data  # no ids
        unknown = api_client().get("/api/invitations/" + "x" * 43 + "/")
        assert unknown.status_code == status.HTTP_404_NOT_FOUND

    def test_owner_of_the_address_joins_as_viewer_once(self, world, invite):
        _, token = invite()
        user = verified_user(NEW_EMAIL)
        response = api_client(user).post(f"/api/invitations/{token}/accept/")
        assert response.status_code == status.HTTP_200_OK, response.data
        assert response.data["organization"] == str(world.a1.pk)
        membership = OrganizationMembership.objects.get(user=user)
        assert membership.organization == world.a1
        assert membership.role == OrganizationRole.VIEWER
        # Single use.
        again = api_client(user).post(f"/api/invitations/{token}/accept/")
        assert again.status_code == status.HTTP_400_BAD_REQUEST

    def test_other_accounts_cannot_use_the_link(self, world, invite):
        _, token = invite()
        response = world.client("carl").post(f"/api/invitations/{token}/accept/")
        assert response.status_code == status.HTTP_403_FORBIDDEN
        unverified = UserFactory(email=NEW_EMAIL)
        EmailAddress.objects.create(user=unverified, email=NEW_EMAIL, verified=False)
        response = api_client(unverified).post(f"/api/invitations/{token}/accept/")
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert not OrganizationMembership.objects.filter(user=unverified).exists()

    def test_expired_link_is_refused(self, world, invite):
        _, token = invite()
        OrganizationInvitation.objects.update(expires_at=timezone.now())
        user = verified_user(NEW_EMAIL)
        response = api_client(user).post(f"/api/invitations/{token}/accept/")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert api_client().get(f"/api/invitations/{token}/").data == {
            "status": "expired",
        }

    def test_anonymous_cannot_accept(self, world, invite):
        _, token = invite()
        response = api_client().post(f"/api/invitations/{token}/accept/")
        assert response.status_code in {401, 403}

    def test_verifying_the_address_accepts_pending_invitations(self, world, invite):
        invite()
        invite(org=world.a2)
        user = UserFactory(email=NEW_EMAIL)
        address = EmailAddress.objects.create(user=user, email=NEW_EMAIL, verified=True)
        email_confirmed.send(sender=EmailAddress, request=None, email_address=address)
        orgs = set(
            OrganizationMembership.objects.filter(user=user).values_list(
                "organization",
                flat=True,
            ),
        )
        assert orgs == {world.a1.pk, world.a2.pk}
        assert set(OrganizationInvitation.objects.values_list("status", flat=True)) == {
            InvitationStatus.ACCEPTED,
        }

    def test_invited_address_may_sign_up_outside_the_domain_allowlist(
        self,
        world,
        invite,
    ):
        adapter = AccountAdapter()
        assert not adapter_accepts(adapter, NEW_EMAIL)
        invite()
        assert adapter_accepts(adapter, NEW_EMAIL)
        OrganizationInvitation.objects.update(status=InvitationStatus.REVOKED)
        assert not adapter_accepts(adapter, NEW_EMAIL)


def adapter_accepts(adapter: AccountAdapter, email: str) -> bool:
    from django.core.exceptions import ValidationError  # noqa: PLC0415

    try:
        adapter.clean_email(email)
    except ValidationError:
        return False
    return True


class TestActivitySorting:
    def test_allowlisted_server_side_ordering(self, world, invite):
        for name in ["Zeta", "Alpha", "Mike"]:
            world.client("ada").post(o_url(world.a1, "sites/"), {"name": name})
        url = o_url(world.a1, "activity/")
        client = world.client("ada")

        def names(query: str) -> list[str]:
            return [e["target_name"] for e in client.get(url + query).data["results"]]

        assert names("?ordering=target_name") == ["Alpha", "Mike", "Zeta"]
        assert names("?ordering=-target_name") == ["Zeta", "Mike", "Alpha"]
        assert names("") == ["Mike", "Alpha", "Zeta"]  # newest first by default
        # Unknown / non-allowlisted fields are ignored (default order).
        assert names("?ordering=details") == names("")
        assert names("?ordering=tenant__name") == names("")

    def test_ordering_keeps_scoping(self, world):
        world.client("ada").post(o_url(world.a2, "sites/"), {"name": "Other org"})
        response = world.client("ada").get(
            o_url(world.a1, "activity/") + "?ordering=target_name",
        )
        assert "Other org" not in [e["target_name"] for e in response.data["results"]]
