from typing import ClassVar

from django.contrib.auth.models import AbstractUser
from django.db.models import SET_NULL
from django.db.models import CharField
from django.db.models import DateTimeField
from django.db.models import EmailField
from django.db.models import ForeignKey
from django.db.models import Model
from django.db.models import TextChoices
from django.utils.translation import gettext_lazy as _

from .managers import UserManager


class User(AbstractUser):
    """
    Default custom user model for NekkoGuard.
    If adding fields that need to be filled at user signup,
    check forms.SignupForm and forms.SocialSignupForms accordingly.
    """

    # First and last name do not cover name patterns around the globe
    name = CharField(_("Name of User"), blank=True, max_length=255)
    first_name = None  # type: ignore[assignment]
    last_name = None  # type: ignore[assignment]
    email = EmailField(_("email address"), unique=True)
    username = None  # type: ignore[assignment]

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    objects: ClassVar[UserManager] = UserManager()


class ImpersonationEvent(Model):
    """Audit trail of "view as user": who looked at the app as whom, and when."""

    class Action(TextChoices):
        START = "start", _("Started viewing as")
        STOP = "stop", _("Stopped viewing as")

    # Emails are copied so the record survives account deletion.
    actor = ForeignKey("users.User", on_delete=SET_NULL, null=True, related_name="+")
    actor_email = EmailField(_("actor email"))
    target = ForeignKey("users.User", on_delete=SET_NULL, null=True, related_name="+")
    target_email = EmailField(_("target email"))
    action = CharField(_("action"), max_length=8, choices=Action.choices)
    created_at = DateTimeField(_("created at"), auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.actor_email} {self.action} {self.target_email}"
