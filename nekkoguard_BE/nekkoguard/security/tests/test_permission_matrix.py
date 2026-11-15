# ruff: noqa: N817, E501, PLR2004 - P/T aliases keep the matrix readable; HTTP codes
"""
Permission matrix: every API route x every HTTP method x every role.

How it works
- ``ROLES`` describes each role's standing *as data* (what it should be able to see
  and do in Tenant A / Organization A1), written by hand from the product rules —
  not computed by the code under test.
- ``MATRIX`` maps every (route name, method) to a rule that turns a role into the
  expected outcome: ``ALLOW`` (authorized: 2xx, or 400 for an empty body), ``FORBID``
  (403), ``HIDE`` (404, existence not revealed), ``MFA`` (403 ``mfa_required``),
  ``ANON`` (401/403 for anonymous requests) or ``CLOSED`` (method not offered).
- ``test_every_api_route_is_in_the_matrix`` walks Django's URL resolver: a new route
  or method without an entry here fails the suite, with the missing items listed.

Each (route, method) is one test; every role runs inside its own rolled-back
transaction, so writes (deletes, publishes…) never affect the next role. A failing
test lists every role whose outcome differs from the expectation.
"""

from __future__ import annotations

import io
from collections.abc import Callable
from dataclasses import dataclass
from dataclasses import field

import pytest
from django.db import transaction
from django.urls import URLResolver
from django.urls import get_resolver
from django.urls import reverse
from PIL import Image
from rest_framework.test import APIClient

from nekkoguard.conftest import enable_totp
from nekkoguard.conftest import sign_in
from nekkoguard.organizations.invitations import hash_token
from nekkoguard.organizations.models import InvitationStatus
from nekkoguard.organizations.models import OrganizationAppearance
from nekkoguard.organizations.models import OrganizationInvitation
from nekkoguard.organizations.models import PermissionOverride
from nekkoguard.organizations.models import TenantAppearance
from nekkoguard.organizations.models import TenantOrganizationAccess
from nekkoguard.organizations.roles import Effect
from nekkoguard.organizations.roles import OrganizationAccess
from nekkoguard.organizations.roles import OrganizationRole
from nekkoguard.organizations.roles import Permission as P
from nekkoguard.organizations.roles import TenantPermission as T
from nekkoguard.organizations.roles import TenantRole
from nekkoguard.organizations.tests.factories import NetworkFactory
from nekkoguard.organizations.tests.factories import OrganizationFactory
from nekkoguard.organizations.tests.factories import OrganizationMembershipFactory
from nekkoguard.organizations.tests.factories import SiteFactory
from nekkoguard.organizations.tests.factories import TenantFactory
from nekkoguard.organizations.tests.factories import TenantMembershipFactory
from nekkoguard.support import terms
from nekkoguard.support.models import TermsAcceptance
from nekkoguard.users.tests.factories import UserFactory

pytestmark = pytest.mark.django_db

ALLOW, FORBID, HIDE, MFA, ANON, CLOSED = (
    "allow",
    "forbid",
    "hide",
    "mfa",
    "anon",
    "closed",
)

READ = frozenset({P.VIEW_SITES, P.VIEW_NETWORKS, P.VIEW_MEMBERS, P.VIEW_ACTIVITY})
ALL_ORG = frozenset(P)
ALL_TENANT = frozenset(T)
TENANT_ADMINISTRATION = frozenset({T.MANAGE_ORGANIZATIONS, T.MANAGE_MEMBERS})
INVITATION_TOKEN = "matrix-invitation-token-0123456789abcdef"  # noqa: S105 - test data


# ---------------------------------------------------------------- roles


@dataclass(frozen=True)
class Role:
    """Expected standing in Tenant A and its Organization A1 (hand-written)."""

    name: str
    anonymous: bool = False
    #: Tenant A appears in /api/tenants/ (member, or direct member of one of its orgs).
    sees_tenant: bool = False
    #: Has a Tenant A membership (or is a superuser): Tenant-scoped views open up.
    tenant_member: bool = False
    #: Tenant permissions held in Tenant A.
    tenant: frozenset = frozenset()
    #: Those Tenant rights apply to A1 (organization access all / selected A1).
    tenant_scope_a1: bool = False
    mfa: bool = False
    #: Effective Organization permissions in A1; None = does not reach A1.
    a1: frozenset | None = None
    #: A1 permissions withheld until the session passes MFA (a superuser's blanket
    #: rights): 403 mfa_required instead of 403 forbidden.
    a1_mfa: frozenset = frozenset()
    superuser: bool = False
    staff: bool = False
    #: Must accept Tenant A's Terms (active member / direct org member, not superuser).
    terms_subject: bool = False
    #: Holds a role that may hand out / remove Organization roles in A1 (an
    #: Administrator role, or Tenant administration). A permission granted by
    #: override alone does not raise one's level (services: roles up to one's own).
    assigns_roles: bool = False


ROLES: list[Role] = [
    Role("anonymous", anonymous=True),
    Role("outsider"),
    Role("staff", staff=True),
    Role("staff_mfa", staff=True, mfa=True),
    Role(
        "superuser",
        superuser=True,
        staff=True,
        sees_tenant=True,
        tenant_member=True,
        tenant=ALL_TENANT,
        tenant_scope_a1=True,
        mfa=True,
        a1=ALL_ORG,
        assigns_roles=True,
    ),
    # Without a session that passed MFA a superuser keeps the read rights only.
    Role(
        "superuser_no_mfa",
        superuser=True,
        staff=True,
        sees_tenant=True,
        tenant_member=True,
        tenant=ALL_TENANT,
        tenant_scope_a1=True,
        a1=READ,
        a1_mfa=ALL_ORG - READ,
        assigns_roles=True,
    ),
    Role(
        "tenant_admin",
        sees_tenant=True,
        tenant_member=True,
        tenant=ALL_TENANT,
        tenant_scope_a1=True,
        mfa=True,
        a1=ALL_ORG,
        terms_subject=True,
        assigns_roles=True,
    ),
    Role(
        "tenant_admin_no_mfa",
        sees_tenant=True,
        tenant_member=True,
        tenant=ALL_TENANT,
        tenant_scope_a1=True,
        a1=ALL_ORG,
        terms_subject=True,
        assigns_roles=True,
    ),
    Role(
        "scoped_admin",
        sees_tenant=True,
        tenant_member=True,
        tenant=ALL_TENANT,
        tenant_scope_a1=True,
        mfa=True,
        a1=READ,
        terms_subject=True,
        assigns_roles=True,
    ),
    Role(
        "tenant_member",
        sees_tenant=True,
        tenant_member=True,
        tenant=frozenset({T.VIEW}),
        a1=READ,
        terms_subject=True,
    ),
    Role(
        "tenant_member_no_orgs",
        sees_tenant=True,
        tenant_member=True,
        tenant=frozenset({T.VIEW}),
        terms_subject=True,
    ),
    Role(
        "org_admin",
        sees_tenant=True,
        a1=ALL_ORG,
        terms_subject=True,
        assigns_roles=True,
    ),
    Role("org_viewer", sees_tenant=True, a1=READ, terms_subject=True),
    Role("org_analyst", sees_tenant=True, a1=READ, terms_subject=True),
    # Overrides: explicit GRANT on a viewer, explicit DENY over an inherited grant.
    Role(
        "viewer_granted_members",
        sees_tenant=True,
        a1=READ | {P.MANAGE_MEMBERS},
        terms_subject=True,
    ),
    Role(
        "member_denied_sites",
        sees_tenant=True,
        tenant_member=True,
        tenant=frozenset({T.VIEW}),
        a1=READ - {P.VIEW_SITES},
        terms_subject=True,
    ),
    # Suspended memberships grant nothing, whatever the role or override.
    Role("suspended_org_admin"),
    Role("suspended_tenant_admin"),
    # Cross-tenant / cross-organization (IDOR): Tenant B admin, viewer of A2 only.
    Role("tenant_b_admin"),
    Role("a2_viewer", sees_tenant=True, terms_subject=True),
]
ROLE_NAMES = [role.name for role in ROLES]


# ---------------------------------------------------------------- rules


Rule = Callable[[Role], str]


def authenticated(inner: Rule) -> Rule:
    return lambda role: ANON if role.anonymous else inner(role)


def anyone_signed_in(role: Role) -> str:
    return ALLOW


def public(role: Role) -> str:
    return ALLOW


def tenant_visible(role: Role) -> str:
    return ALLOW if role.sees_tenant else HIDE


def tenant_right(*perms: T) -> Rule:
    """Tenant-scoped views: 404 without a Tenant membership, then the Tenant right
    (MFA required for administration rights)."""

    def rule(role: Role) -> str:
        if not role.tenant_member:
            return HIDE
        if set(perms) & role.tenant:
            return ALLOW if role.mfa or perms == (T.VIEW,) else MFA
        return FORBID

    return rule


def a1_visible(role: Role) -> bool:
    return role.a1 is not None or (
        role.tenant_scope_a1 and bool(role.tenant & TENANT_ADMINISTRATION)
    )


def org_right(
    org: set | frozenset,
    tenant_perms: set | frozenset = frozenset(),
) -> Rule:
    """Organization views: 404 without standing in A1; the Organization right; or a
    Tenant right in scope (which needs MFA)."""

    def rule(role: Role) -> str:
        if not a1_visible(role):
            return HIDE
        if role.a1 is not None and set(org) & role.a1:
            return ALLOW
        if role.tenant_scope_a1 and set(tenant_perms) & role.tenant:
            return ALLOW if role.mfa else MFA
        if set(org) & role.a1_mfa:
            return MFA
        return FORBID

    return rule


def org_visible(role: Role) -> str:
    return ALLOW if a1_visible(role) else HIDE


def tenant_detail_write(role: Role) -> str:
    if not role.sees_tenant:
        return HIDE
    if T.MANAGE in role.tenant:
        return ALLOW if role.mfa else MFA
    return FORBID


def organizations_list(role: Role) -> str:
    # Tenant members, or people who reach one of its organizations.
    return ALLOW if role.tenant_member or role.sees_tenant else HIDE


def organization_create(role: Role) -> str:
    # Anyone who may list the Tenant's organizations is told "forbidden", not "not found".
    if organizations_list(role) == HIDE:
        return HIDE
    if T.MANAGE_ORGANIZATIONS in role.tenant:
        return ALLOW if role.mfa else MFA
    return FORBID


def org_manage_level(role: Role) -> str:
    """Removing members, revoking/resending invitations, removing overrides: the
    access-management right AND a role level that may handle Organization roles."""
    expected = org_right(*MANAGE_ACCESS)(role)
    if expected == ALLOW and not role.assigns_roles:
        return FORBID
    return expected


def terms_manage(role: Role) -> str:
    if not role.sees_tenant:
        return HIDE
    if T.MANAGE in role.tenant:
        return ALLOW if role.mfa else MFA
    return FORBID


def terms_accept(role: Role) -> str:
    return ALLOW if role.terms_subject else HIDE


def tenant_appearance_read(role: Role) -> str:
    return ALLOW if role.staff or role.sees_tenant else HIDE


def tenant_appearance_write(role: Role) -> str:
    if not (role.staff or role.sees_tenant):
        return HIDE
    if T.MANAGE_APPEARANCE in role.tenant and role.mfa:
        return ALLOW
    if role.staff:
        # Platform Administrator (outside the Tenant role system): MFA session only.
        return ALLOW if role.mfa else MFA
    if T.MANAGE_APPEARANCE in role.tenant:
        return MFA
    return FORBID


def org_appearance_read(role: Role) -> str:
    if role.staff or role.a1 is not None:
        return ALLOW
    rights = TENANT_ADMINISTRATION | {T.MANAGE_APPEARANCE}
    return ALLOW if role.tenant_scope_a1 and role.tenant & rights else HIDE


def org_appearance_write(role: Role) -> str:
    if org_appearance_read(role) == HIDE:
        return HIDE
    if role.a1 is not None and P.MANAGE_APPEARANCE in role.a1:
        return ALLOW  # an Organization-level right: not Tenant administration
    in_scope = role.tenant_scope_a1 and T.MANAGE_APPEARANCE in role.tenant
    if in_scope and role.mfa:
        return ALLOW
    if role.staff:
        return ALLOW if role.mfa else MFA
    if in_scope or P.MANAGE_APPEARANCE in role.a1_mfa:
        return MFA
    return FORBID


def superuser_only(role: Role) -> str:
    return ALLOW if role.superuser else FORBID


def staff_read(role: Role) -> str:
    """Read-only staff pages (API schema/docs): no privileged change, no MFA."""
    return ALLOW if role.staff else FORBID


def staff_only(role: Role) -> str:
    """Platform-level administration: staff, in a session that passed MFA."""
    if not role.staff:
        return FORBID
    return ALLOW if role.mfa else MFA


def never(role: Role) -> str:
    """No session user may use it (e.g. Bearer-token-only endpoints)."""
    return FORBID


def nobody_found(role: Role) -> str:
    return HIDE


VIEW_ACCESS = ({P.VIEW_MEMBERS, P.MANAGE_MEMBERS}, {T.MANAGE_MEMBERS})
MANAGE_ACCESS = ({P.MANAGE_MEMBERS}, {T.MANAGE_MEMBERS})


# ---------------------------------------------------------------- world


@dataclass
class World:
    users: dict = field(default_factory=dict)
    ids: dict = field(default_factory=dict)


def _png() -> bytes:
    out = io.BytesIO()
    Image.new("RGBA", (4, 4), (10, 20, 30, 255)).save(out, format="PNG")
    return out.getvalue()


def build_world() -> World:
    tenant_a, tenant_b = TenantFactory(name="Matrix A"), TenantFactory(name="Matrix B")
    a1 = OrganizationFactory(tenant=tenant_a, name="A1")
    a2 = OrganizationFactory(tenant=tenant_a, name="A2")
    b1 = OrganizationFactory(tenant=tenant_b, name="B1")
    u = {
        name: UserFactory(email=f"{name}@matrix.test")
        for name in ROLE_NAMES
        if name != "anonymous"
    }
    for name in ("superuser", "superuser_no_mfa"):
        u[name].is_superuser = u[name].is_staff = True
        u[name].save()
    for name in ("staff", "staff_mfa"):
        u[name].is_staff = True
        u[name].save()
    for name in (
        "superuser",
        "staff_mfa",
        "tenant_admin",
        "scoped_admin",
        "tenant_b_admin",
    ):
        enable_totp(u[name])

    def tenant_member(
        tenant,
        user,
        role,
        access=OrganizationAccess.NONE,
        default="",
        **kw,
    ):
        return TenantMembershipFactory(
            tenant=tenant,
            user=user,
            role=role,
            organization_access=access,
            default_organization_role=default,
            **kw,
        )

    admin_role, member_role = TenantRole.ADMIN, TenantRole.MEMBER
    tenant_member(
        tenant_a,
        u["tenant_admin"],
        admin_role,
        OrganizationAccess.ALL,
        OrganizationRole.ADMIN,
    )
    tenant_member(
        tenant_a,
        u["tenant_admin_no_mfa"],
        admin_role,
        OrganizationAccess.ALL,
        OrganizationRole.ADMIN,
    )
    scoped = tenant_member(
        tenant_a,
        u["scoped_admin"],
        admin_role,
        OrganizationAccess.SELECTED,
        OrganizationRole.VIEWER,
    )
    TenantOrganizationAccess.objects.create(membership=scoped, organization=a1)
    tenant_member(
        tenant_a,
        u["tenant_member"],
        member_role,
        OrganizationAccess.ALL,
        OrganizationRole.VIEWER,
    )
    no_orgs = tenant_member(tenant_a, u["tenant_member_no_orgs"], member_role)
    tenant_member(
        tenant_a,
        u["member_denied_sites"],
        member_role,
        OrganizationAccess.ALL,
        OrganizationRole.VIEWER,
    )
    tenant_member(
        tenant_a,
        u["suspended_tenant_admin"],
        admin_role,
        OrganizationAccess.ALL,
        OrganizationRole.ADMIN,
        status="suspended",
    )
    tenant_member(
        tenant_b,
        u["tenant_b_admin"],
        admin_role,
        OrganizationAccess.ALL,
        OrganizationRole.ADMIN,
    )

    OrganizationMembershipFactory(
        organization=a1,
        user=u["org_admin"],
        role=OrganizationRole.ADMIN,
    )
    viewer = OrganizationMembershipFactory(
        organization=a1,
        user=u["org_viewer"],
        role=OrganizationRole.VIEWER,
    )
    OrganizationMembershipFactory(
        organization=a1,
        user=u["org_analyst"],
        role=OrganizationRole.SECURITY_ANALYST,
    )
    OrganizationMembershipFactory(
        organization=a1,
        user=u["viewer_granted_members"],
        role=OrganizationRole.VIEWER,
    )
    OrganizationMembershipFactory(
        organization=a1,
        user=u["suspended_org_admin"],
        role=OrganizationRole.ADMIN,
        status="suspended",
    )
    OrganizationMembershipFactory(
        organization=a2,
        user=u["a2_viewer"],
        role=OrganizationRole.VIEWER,
    )
    PermissionOverride.objects.create(
        organization=a1,
        user=u["viewer_granted_members"],
        permission=P.MANAGE_MEMBERS,
        effect=Effect.GRANT,
    )
    denied = PermissionOverride.objects.create(
        organization=a1,
        user=u["member_denied_sites"],
        permission=P.VIEW_SITES,
        effect=Effect.DENY,
    )

    site = SiteFactory(organization=a1)
    network = NetworkFactory(site=site)
    invitation = OrganizationInvitation.objects.create(
        organization=a1,
        email="invitee@matrix.test",
        role=OrganizationRole.VIEWER,
        invited_by=u["tenant_admin"],
        token_hash=hash_token(INVITATION_TOKEN),
        status=InvitationStatus.PENDING,
        expires_at="2999-01-01T00:00:00Z",
        last_sent_at="2026-01-01T00:00:00Z",
    )
    logo = _png()
    TenantAppearance.objects.create(tenant=tenant_a, logo=logo, logo_hash="a" * 16)
    OrganizationAppearance.objects.create(
        organization=a1,
        logo=logo,
        logo_hash="b" * 16,
    )

    # Terms: a current version everyone already accepted (so nobody is blocked), and a draft.
    current = terms.publish(
        actor=u["tenant_admin"],
        draft=terms.create_draft(actor=u["tenant_admin"], tenant=tenant_a),
    )
    TermsAcceptance.objects.bulk_create(
        TermsAcceptance(
            tenant=tenant_a,
            user=user,
            user_email=user.email,
            version=current,
            content_hash=current.content_hash,
        )
        for user in u.values()
    )
    draft = terms.create_draft(actor=u["tenant_admin"], tenant=tenant_a)

    world = World(users=u)
    world.ids = {
        "tenant": tenant_a.pk,
        "a1": a1.pk,
        "b1": b1.pk,
        "site": site.pk,
        "network": network.pk,
        "tenant_membership": no_orgs.pk,
        "org_membership": viewer.pk,
        "override": denied.pk,
        "invitation": invitation.pk,
        "current": current.pk,
        "draft": draft.pk,
    }
    return world


# ---------------------------------------------------------------- matrix


@dataclass(frozen=True)
class Endpoint:
    name: str
    kwargs: Callable[[World, object], dict]
    rules: dict[str, Rule]


def t(w, _user):
    return {"tenant_pk": w.ids["tenant"]}


def o(w, _user):
    return {"tenant_pk": w.ids["tenant"], "organization_pk": w.ids["a1"]}


def with_(base, **extra):
    return lambda w, user: {
        **base(w, user),
        **{
            k: (w.ids[v] if isinstance(v, str) and v in w.ids else v)
            for k, v in extra.items()
        },
    }


def none(_w, _user):
    return {}


A = authenticated  # shorthand

MATRIX: list[Endpoint] = [
    # Users and session
    Endpoint("api:user-list", none, {"GET": A(anyone_signed_in)}),
    Endpoint("api:user-me", none, {"GET": A(anyone_signed_in)}),
    Endpoint(
        "api:user-detail",
        lambda w, user: {"pk": getattr(user, "pk", 0)},
        {
            "GET": A(anyone_signed_in),
            "PATCH": A(anyone_signed_in),
            "PUT": A(anyone_signed_in),
        },
    ),
    # Stopping is a harmless no-op for anyone not viewing as someone.
    Endpoint(
        "impersonation",
        none,
        {
            "GET": A(anyone_signed_in),
            "POST": A(superuser_only),
            "DELETE": A(anyone_signed_in),
        },
    ),
    Endpoint("impersonation-users", none, {"GET": A(superuser_only)}),
    Endpoint("api-schema", none, {"GET": A(staff_read)}),
    Endpoint("api-docs", none, {"GET": A(staff_read)}),
    # OAuth (connected applications)
    Endpoint("oauth-profile", none, {"GET": A(never)}),
    Endpoint("oauth-authorized-apps", none, {"GET": A(anyone_signed_in)}),
    Endpoint(
        "oauth-authorized-app",
        lambda w, u: {"pk": 999999},
        {"DELETE": A(nobody_found)},
    ),
    Endpoint(
        "oauth-application-list",
        none,
        {"GET": A(staff_only), "POST": A(staff_only)},
    ),
    Endpoint(
        "oauth-application-detail",
        lambda w, u: {"pk": 999999},
        {"DELETE": A(lambda r: staff_only(r) if staff_only(r) != ALLOW else HIDE)},
    ),
    # Software
    Endpoint("api:help-releases", none, {"GET": A(anyone_signed_in)}),
    Endpoint("api:bug-report", none, {"POST": A(anyone_signed_in)}),
    # Tenants
    Endpoint("api:tenant-list", none, {"GET": A(anyone_signed_in)}),
    Endpoint("api:my-organization-list", none, {"GET": A(anyone_signed_in)}),
    Endpoint(
        "api:tenant-detail",
        lambda w, u: {"pk": w.ids["tenant"]},
        {
            "GET": A(tenant_visible),
            "PATCH": A(tenant_detail_write),
            "PUT": A(tenant_detail_write),
        },
    ),
    Endpoint(
        "api:tenant-member-list",
        t,
        {
            "GET": A(tenant_right(T.MANAGE_MEMBERS)),
            "POST": A(tenant_right(T.MANAGE_MEMBERS)),
        },
    ),
    Endpoint(
        "api:tenant-member-detail",
        with_(t, pk="tenant_membership"),
        {
            m: A(tenant_right(T.MANAGE_MEMBERS))
            for m in ("GET", "PATCH", "PUT", "DELETE")
        },
    ),
    Endpoint("api:tenant-activity-list", t, {"GET": A(tenant_right(T.VIEW_ACTIVITY))}),
    Endpoint(
        "api:organization-list",
        t,
        {"GET": A(organizations_list), "POST": A(organization_create)},
    ),
    Endpoint(
        "api:tenant-appearance",
        t,
        {
            "GET": A(tenant_appearance_read),
            "PATCH": A(tenant_appearance_write),
            "DELETE": A(tenant_appearance_write),
        },
    ),
    Endpoint(
        "api:tenant-appearance-asset",
        with_(t, asset="logo"),
        {
            "GET": A(tenant_appearance_read),
            "PUT": A(tenant_appearance_write),
            "DELETE": A(tenant_appearance_write),
        },
    ),
    # Organization A1
    Endpoint(
        "api:organization-detail-detail",
        o,
        {
            "GET": A(org_visible),
            "PATCH": A(org_right({P.MANAGE_ORGANIZATION}, {T.MANAGE_ORGANIZATIONS})),
            "PUT": A(org_right({P.MANAGE_ORGANIZATION}, {T.MANAGE_ORGANIZATIONS})),
        },
    ),
    Endpoint(
        "api:organization-member-list",
        o,
        {"GET": A(org_right(*VIEW_ACCESS)), "POST": A(org_right(*MANAGE_ACCESS))},
    ),
    Endpoint(
        "api:organization-member-detail",
        with_(o, pk="org_membership"),
        {
            "GET": A(org_right(*VIEW_ACCESS)),
            "PATCH": A(org_right(*MANAGE_ACCESS)),
            "PUT": A(org_right(*MANAGE_ACCESS)),
            "DELETE": A(org_manage_level),
        },
    ),
    Endpoint(
        "api:organization-invitation-list",
        o,
        {"GET": A(org_right(*VIEW_ACCESS))},
    ),
    Endpoint(
        "api:organization-invitation-detail",
        with_(o, pk="invitation"),
        {"GET": A(org_right(*VIEW_ACCESS)), "DELETE": A(org_manage_level)},
    ),
    Endpoint(
        "api:organization-invitation-resend",
        with_(o, pk="invitation"),
        {"POST": A(org_manage_level)},
    ),
    Endpoint(
        "api:permission-override-list",
        o,
        {"GET": A(org_right(*VIEW_ACCESS)), "POST": A(org_right(*MANAGE_ACCESS))},
    ),
    Endpoint(
        "api:permission-override-detail",
        with_(o, pk="override"),
        {
            "GET": A(org_right(*VIEW_ACCESS)),
            "PATCH": A(org_right(*MANAGE_ACCESS)),
            "PUT": A(org_right(*MANAGE_ACCESS)),
            "DELETE": A(org_manage_level),
        },
    ),
    Endpoint("api:organization-access-list", o, {"GET": A(org_right(*VIEW_ACCESS))}),
    Endpoint(
        "api:site-list",
        o,
        {"GET": A(org_right({P.VIEW_SITES})), "POST": A(org_right({P.MANAGE_SITES}))},
    ),
    Endpoint(
        "api:site-detail",
        with_(o, pk="site"),
        {
            "GET": A(org_right({P.VIEW_SITES})),
            **{m: A(org_right({P.MANAGE_SITES})) for m in ("PATCH", "PUT", "DELETE")},
        },
    ),
    Endpoint(
        "api:network-list",
        o,
        {
            "GET": A(org_right({P.VIEW_NETWORKS})),
            "POST": A(org_right({P.MANAGE_NETWORKS})),
        },
    ),
    Endpoint(
        "api:network-detail",
        with_(o, pk="network"),
        {
            "GET": A(org_right({P.VIEW_NETWORKS})),
            **{
                m: A(org_right({P.MANAGE_NETWORKS})) for m in ("PATCH", "PUT", "DELETE")
            },
        },
    ),
    Endpoint(
        "api:organization-activity-list",
        o,
        {"GET": A(org_right({P.VIEW_ACTIVITY}, {T.VIEW_ACTIVITY}))},
    ),
    Endpoint(
        "api:organization-appearance",
        o,
        {
            "GET": A(org_appearance_read),
            "PATCH": A(org_appearance_write),
            "DELETE": A(org_appearance_write),
        },
    ),
    Endpoint(
        "api:organization-appearance-asset",
        with_(o, asset="logo"),
        {
            "GET": A(org_appearance_read),
            "PUT": A(org_appearance_write),
            "DELETE": A(org_appearance_write),
        },
    ),
    # Invitations (links from emails)
    Endpoint(
        "api:invitation-link",
        lambda w, u: {"token": INVITATION_TOKEN},
        {"GET": public},
    ),
    # Only the owner of the invited address may accept: nobody here is.
    Endpoint(
        "api:invitation-accept",
        lambda w, u: {"token": INVITATION_TOKEN},
        {"POST": A(lambda r: FORBID)},
    ),
    # Terms of Service
    Endpoint("api:terms-pending", none, {"GET": A(anyone_signed_in)}),
    Endpoint("api:terms-decline", none, {"POST": A(anyone_signed_in)}),
    Endpoint(
        "api:terms-accept",
        lambda w, u: {"version_pk": w.ids["current"]},
        {"POST": A(terms_accept)},
    ),
    Endpoint("api:tenant-terms", t, {"GET": A(tenant_visible)}),
    Endpoint("api:tenant-terms-history", t, {"GET": A(tenant_visible)}),
    Endpoint(
        "api:tenant-terms-history-version",
        with_(t, version_pk="current"),
        {"GET": A(tenant_visible)},
    ),
    Endpoint(
        "api:tenant-terms-versions",
        t,
        {"GET": A(terms_manage), "POST": A(terms_manage)},
    ),
    Endpoint(
        "api:tenant-terms-version",
        with_(t, version_pk="draft"),
        {m: A(terms_manage) for m in ("GET", "PATCH", "DELETE")},
    ),
    Endpoint(
        "api:tenant-terms-publish",
        with_(t, version_pk="draft"),
        {"POST": A(terms_manage)},
    ),
    Endpoint("api:tenant-terms-acceptances", t, {"GET": A(terms_manage)}),
    Endpoint("api:tenant-terms-summary", t, {"GET": A(terms_manage)}),
    Endpoint(
        "api:organization-terms-acceptances",
        o,
        {"GET": A(org_right(*VIEW_ACCESS))},
    ),
    Endpoint("api:organization-terms-summary", o, {"GET": A(org_right(*VIEW_ACCESS))}),
]

#: Routes outside the matrix on purpose (no authorization decision to test).
NOT_IN_MATRIX = {
    "api:api-root",  # DRF browsable root, DEBUG only
}


# ---------------------------------------------------------------- outcome


def outcome(response) -> str:
    code = response.status_code
    if code == 405:
        return CLOSED
    if code in (401, 403):
        try:
            body = response.json()
        except ValueError:
            body = {}
        return (
            MFA
            if isinstance(body, dict) and body.get("code") == "mfa_required"
            else FORBID
        )
    if code == 404:
        return HIDE
    if code < 500:
        return ALLOW
    return f"error {code}"


def offered(name: str, method: str) -> bool:
    """False for router-mapped methods the view does not offer (e.g. PUT)."""
    for route_name, _methods, view_methods in api_routes():
        if route_name == name:
            return method in view_methods
    return True


CASES = [(endpoint, method) for endpoint in MATRIX for method in endpoint.rules]


@pytest.mark.parametrize(
    ("endpoint", "method"),
    CASES,
    ids=[f"{e.name} {m}" for e, m in CASES],
)
def test_permission_matrix(endpoint: Endpoint, method: str):
    world = build_world()
    mismatches = []
    for role in ROLES:
        user = None if role.anonymous else world.users[role.name]
        client = APIClient()
        if user is not None:
            sign_in(client, user)  # session; MFA step recorded when the user has MFA
        url = reverse(endpoint.name, kwargs=endpoint.kwargs(world, user))
        with transaction.atomic():
            response = getattr(client, method.lower())(url, {}, format="json")
            transaction.set_rollback(True)  # every role starts from the same world
        got = outcome(response)
        expected = endpoint.rules[method](role)
        if not offered(endpoint.name, method):
            # Not offered by the view: no role may ever succeed.
            expected = got if got in (CLOSED, FORBID, HIDE, ANON) else CLOSED
        if expected == ANON:
            expected = FORBID  # DRF answers 403 to anonymous session requests
        if got != expected:
            mismatches.append(
                f"{role.name}: expected {expected}, got {got} ({response.status_code})",
            )
    assert not mismatches, f"{method} {endpoint.name}\n" + "\n".join(mismatches)


# ---------------------------------------------------------------- coverage


def api_routes():
    """(route name, router methods, methods the view offers) for every /api/ route."""

    def walk(patterns, prefix="", namespace=None):
        for pattern in patterns:
            if isinstance(pattern, URLResolver):
                yield from walk(
                    pattern.url_patterns,
                    prefix + str(pattern.pattern),
                    pattern.namespace or namespace,
                )
            else:
                yield prefix + str(pattern.pattern), pattern, namespace

    seen = []
    for route, pattern, namespace in walk(get_resolver().url_patterns):
        if not route.replace("^", "").startswith("api/") or pattern.name is None:
            continue
        name = f"{namespace}:{pattern.name}" if namespace else pattern.name
        callback = pattern.callback
        view = getattr(callback, "cls", None) or getattr(callback, "view_class", None)
        actions = getattr(callback, "actions", None)
        if actions:
            methods = {m.upper() for m in actions} - {"HEAD", "OPTIONS"}
        elif view is not None:
            methods = {
                m.upper()
                for m in view.http_method_names
                if m not in ("options", "head") and hasattr(view, m)
            }
        else:
            methods = {"GET"}
        view_methods = (
            {m.upper() for m in view.http_method_names} & methods
            if view is not None
            else methods
        )
        seen.append((name, methods, view_methods))
    return seen


def test_every_api_route_is_in_the_matrix():
    covered = {(e.name, m) for e in MATRIX for m in e.rules}
    missing = sorted(
        f"{name} {method}"
        for name, methods, _view in api_routes()
        if name not in NOT_IN_MATRIX
        for method in methods
        if (name, method) not in covered
    )
    assert not missing, (
        "API routes/methods without permission-matrix coverage "
        "(add them to MATRIX in security/tests/test_permission_matrix.py):\n"
        + "\n".join(missing)
    )


def test_matrix_has_no_stale_entries():
    existing = {
        (name, method) for name, methods, _ in api_routes() for method in methods
    }
    stale = sorted(
        f"{e.name} {m}" for e in MATRIX for m in e.rules if (e.name, m) not in existing
    )
    assert not stale, "Matrix entries for routes that no longer exist:\n" + "\n".join(
        stale,
    )


def test_every_rule_answers_for_every_role():
    for endpoint in MATRIX:
        for method, rule in endpoint.rules.items():
            for role in ROLES:
                assert rule(role) in {ALLOW, FORBID, HIDE, MFA, ANON, CLOSED}, (
                    endpoint.name,
                    method,
                    role.name,
                )


# ---------------------------------------------------------------- IDOR: swapped ids


def _get(user, name, **kwargs):
    client = APIClient()
    sign_in(client, user)
    return client.get(reverse(name, kwargs=kwargs))


def test_resources_of_another_organization_are_not_reachable_through_mine():
    world = build_world()
    a1, site = world.ids["a1"], world.ids["site"]
    tenant = world.ids["tenant"]
    other = OrganizationFactory(tenant_id=tenant, name="A3")
    foreign_site = SiteFactory(organization=other)
    org_admin = world.users["org_admin"]  # administers A1 only
    # A3's site through A1's URL: not found (querysets are built from the URL org).
    assert (
        _get(
            org_admin,
            "api:site-detail",
            tenant_pk=tenant,
            organization_pk=a1,
            pk=foreign_site.pk,
        ).status_code
        == 404
    )
    # A1's site through A3's URL: no standing in A3.
    assert (
        _get(
            org_admin,
            "api:site-detail",
            tenant_pk=tenant,
            organization_pk=other.pk,
            pk=site,
        ).status_code
        == 404
    )


def test_an_organization_is_only_found_inside_its_own_tenant():
    world = build_world()
    b_admin = world.users["tenant_b_admin"]
    b_tenant = world.ids["b1"]
    from nekkoguard.organizations.models import Organization  # noqa: PLC0415

    tenant_b = Organization.objects.get(pk=b_tenant).tenant_id
    # Tenant B in the URL, Organization A1 (Tenant A) as the child: not found.
    response = _get(
        b_admin,
        "api:site-list",
        tenant_pk=tenant_b,
        organization_pk=world.ids["a1"],
    )
    assert response.status_code == 404
    response = _get(
        b_admin,
        "api:tenant-member-detail",
        tenant_pk=tenant_b,
        pk=world.ids["tenant_membership"],
    )
    assert response.status_code == 404


def test_users_cannot_read_other_users_records():
    world = build_world()
    me, other = world.users["org_viewer"], world.users["tenant_admin"]
    assert _get(me, "api:user-detail", pk=other.pk).status_code == 404
