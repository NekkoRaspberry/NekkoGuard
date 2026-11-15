from django.apps import AppConfig
from django.utils.translation import gettext_lazy as _


class OrganizationsConfig(AppConfig):
    name = "nekkoguard.organizations"
    verbose_name = _("Organizations")

    def ready(self) -> None:
        from . import signals  # noqa: F401, PLC0415
