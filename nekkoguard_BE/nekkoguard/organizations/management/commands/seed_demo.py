"""
Create the demo Tenant, Organizations and users (development only).

    python manage.py seed_demo             # create whatever is missing
    python manage.py seed_demo --if-empty  # only when no Tenant exists yet

Password for new demo users: ``NEKKOGUARD_DEMO_PASSWORD`` from the environment
(keep it in the git-ignored ``.envs/.local/.django``). Without it, a random one is
generated and printed once.

Refuses to run unless ``DEBUG`` is on: production never gets demo accounts. A new
production database is initialised with ``createsuperuser``; that platform
administrator then creates the first Tenant.
"""

from __future__ import annotations

import os

from django.conf import settings
from django.core.management.base import BaseCommand
from django.core.management.base import CommandError

from nekkoguard.organizations.demo import DEMO_EMAILS
from nekkoguard.organizations.demo import seed_demo

PASSWORD_ENV = "NEKKOGUARD_DEMO_PASSWORD"  # noqa: S105 (a variable name, not a secret)


class Command(BaseCommand):
    help = "Create the demo environment (development only, idempotent)."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--if-empty",
            action="store_true",
            help="Do nothing if any Tenant already exists.",
        )

    def handle(self, *args, **options) -> None:
        if not settings.DEBUG:
            msg = "seed_demo only runs with DEBUG on (never in production)."
            raise CommandError(msg)
        result = seed_demo(
            password=os.environ.get(PASSWORD_ENV) or None,
            if_empty=options["if_empty"],
        )
        if result.skipped:
            self.stdout.write("Tenants already exist: demo data not created.")
            return
        self.stdout.write(self.style.SUCCESS("Demo environment is ready."))
        self.stdout.write("Demo users: " + ", ".join(DEMO_EMAILS))
        if result.created_users:
            self.stdout.write("Created: " + ", ".join(result.created_users))
        if result.generated_password:
            self.stdout.write(
                self.style.WARNING(
                    f"Generated password (shown once, development only): "
                    f"{result.generated_password}",
                ),
            )
