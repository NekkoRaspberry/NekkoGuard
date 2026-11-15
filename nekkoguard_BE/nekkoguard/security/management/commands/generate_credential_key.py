"""Print a new random 256-bit key for DJANGO_CREDENTIAL_KEYS (nothing is stored)."""

from django.core.management.base import BaseCommand

from nekkoguard.security.crypto import generate_key


class Command(BaseCommand):
    help = "Print a new credential encryption key (base64, 32 random bytes)."

    def add_arguments(self, parser):
        parser.add_argument("--id", default="k1", help="Key id to prefix (e.g. 2026a).")

    def handle(self, *args, **options):
        self.stdout.write(f"{options['id']}:{generate_key()}")
