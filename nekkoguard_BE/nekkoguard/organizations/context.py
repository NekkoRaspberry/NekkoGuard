"""
Which Tenant the app opens when the user has no remembered choice.

The frontend applies, in order:

1. the Tenant/Organization in the URL, else the last one this user chose (remembered
   per user in the browser);
2. otherwise the Tenant returned here as the default, and its first Organization.

The default Tenant:

- **Superuser without any membership** → the demo Tenant (``seed_demo``), when it
  exists and has an Organization the user can open.
- **Everyone else** → the first Tenant (by name) in which the user can open at least
  one Organization; failing that, the first Tenant they can see.

Only Tenants from ``visible_tenants()`` are ever returned: this changes where the app
starts, never what a user may access.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from . import access
from .demo import demo_id
from .models import MembershipStatus
from .models import OrganizationMembership
from .models import TenantMembership

if TYPE_CHECKING:
    import uuid

    from django.db.models import QuerySet

    from .models import Tenant

DEMO_TENANT_ID = demo_id("tenant")


def _has_memberships(user) -> bool:
    active = MembershipStatus.ACTIVE
    return (
        TenantMembership.objects.filter(user=user, status=active).exists()
        or OrganizationMembership.objects.filter(user=user, status=active).exists()
    )


def default_tenant_id(
    user,
    visible: QuerySet[Tenant] | None = None,
) -> uuid.UUID | None:
    visible = access.visible_tenants(user) if visible is None else visible
    reachable = access.accessible_organizations(user).filter(tenant__in=visible)

    if access.is_superuser(user) and not _has_memberships(user):
        if reachable.filter(tenant_id=DEMO_TENANT_ID).exists():
            return DEMO_TENANT_ID

    first_reachable = (
        reachable.order_by("tenant__name").values_list("tenant_id", flat=True).first()
    )
    if first_reachable is not None:
        return first_reachable
    return visible.order_by("name").values_list("pk", flat=True).first()
