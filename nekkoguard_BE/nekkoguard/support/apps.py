from django.apps import AppConfig
from django.utils.translation import gettext_lazy as _


class SupportConfig(AppConfig):
    """Help & support: Terms of Service, release notes and bug reports."""

    name = "nekkoguard.support"
    verbose_name = _("Support")
