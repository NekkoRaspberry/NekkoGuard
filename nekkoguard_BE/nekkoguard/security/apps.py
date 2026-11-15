from django.apps import AppConfig
from django.utils.translation import gettext_lazy as _


class SecurityConfig(AppConfig):
    """Security hardening: headers, throttling, credential encryption, deploy checks."""

    name = "nekkoguard.security"
    verbose_name = _("Security")

    def ready(self) -> None:
        from . import checks  # noqa: F401, PLC0415 - registers the system checks
