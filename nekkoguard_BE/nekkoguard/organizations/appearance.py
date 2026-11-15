"""
White-label appearance: validation, image processing, inheritance and audited writes.

Resolution, per property and independently of the others::

    Organization value  →  Tenant value  →  None (= NekkoGuard default)

``None`` always means "not configured here". The backend never stores or returns
the NekkoGuard default values: the frontend's design tokens stay their only source,
so an uncustomized Tenant/Organization renders exactly like NekkoGuard does today.

Who may change what is decided in ``api/appearance.py`` with ``access.py``; the
services below assume the caller was already authorized.
"""

from __future__ import annotations

import hashlib
import io
import re
import warnings
from dataclasses import dataclass
from pathlib import PurePath
from typing import TYPE_CHECKING
from typing import Any

from django.db import transaction
from django.utils.translation import gettext_lazy as _
from PIL import Image
from PIL import UnidentifiedImageError
from rest_framework.exceptions import ValidationError

from .models import APPEARANCE_ASSETS
from .models import APPEARANCE_FIELDS
from .models import COLOR_FIELDS
from .models import TITLE_MAX_LENGTH
from .models import NavbarPosition
from .models import Organization
from .models import OrganizationAppearance
from .models import Tenant
from .models import TenantAppearance
from .services import record_activity

if TYPE_CHECKING:
    from django.core.files.uploadedfile import UploadedFile

    from nekkoguard.users.models import User

    from .models import Appearance


class Source:
    ORGANIZATION = "organization"
    TENANT = "tenant"
    DEFAULT = "default"


# ---------------------------------------------------------------- validation

_HEX_SHORT = re.compile(r"^#([0-9a-fA-F]{3})$")
_HEX_LONG = re.compile(r"^#([0-9a-fA-F]{6})$")
_RGB = re.compile(r"^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$")
_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")


class InvalidValueError(ValueError):
    """A submitted appearance value is not acceptable (message is user-facing)."""


_COLOR_MESSAGE = _("Enter a color as #rrggbb, #rgb or rgb(r, g, b).")
_MAX_CHANNEL = 255


def normalize_color(value: Any) -> str:
    """Accept ``#rgb``, ``#rrggbb`` or ``rgb(r, g, b)``; return ``#rrggbb``."""
    text = value.strip() if isinstance(value, str) else ""
    if match := _HEX_LONG.match(text):
        return f"#{match.group(1).lower()}"
    if match := _HEX_SHORT.match(text):
        return "#" + "".join(c * 2 for c in match.group(1).lower())
    if match := _RGB.match(text):
        channels = [int(c) for c in match.groups()]
        if all(c <= _MAX_CHANNEL for c in channels):
            return "#" + "".join(f"{c:02x}" for c in channels)
    raise InvalidValueError(_COLOR_MESSAGE)


def clean_title(value: Any) -> str:
    title = value.strip() if isinstance(value, str) else ""
    if not title:
        raise InvalidValueError(_("Enter a title, or reset it to inherit."))
    if len(title) > TITLE_MAX_LENGTH:
        raise InvalidValueError(
            _("Use at most %(n)d characters.") % {"n": TITLE_MAX_LENGTH},
        )
    if _CONTROL_CHARS.search(title):
        raise InvalidValueError(_("The title cannot contain control characters."))
    return title


def clean_navbar_position(value: Any) -> str:
    if value not in NavbarPosition.values:
        raise InvalidValueError(_("Choose left, top or right."))
    return value


def _cleaner(key: str):
    if key in COLOR_FIELDS:
        return normalize_color
    if key == "title":
        return clean_title
    return clean_navbar_position


def clean_values(data: Any) -> dict[str, str | None]:
    """
    Validate a partial update. ``None`` resets a property (inherit again).
    Unknown keys are rejected so typos are not silently ignored.
    """
    if not isinstance(data, dict):
        raise ValidationError({"non_field_errors": [_("Expected an object.")]})
    errors: dict[str, list[str]] = {}
    cleaned: dict[str, str | None] = {}
    for key, value in data.items():
        if key not in APPEARANCE_FIELDS:
            errors[key] = [_("Unknown appearance setting.")]
        elif value is None:
            cleaned[key] = None
        else:
            try:
                cleaned[key] = _cleaner(key)(value)
            except InvalidValueError as error:
                errors[key] = [str(error)]
    if errors:
        raise ValidationError(errors)
    return cleaned


# ---------------------------------------------------------------- images

MAX_UPLOAD_BYTES = 1024 * 1024  # 1 MB
MAX_SOURCE_PIXELS = 4096 * 4096  # refuse decompression bombs early
#: extension → Pillow format. SVG is deliberately not accepted (script risk).
ALLOWED_EXTENSIONS = {
    ".png": "PNG",
    ".jpg": "JPEG",
    ".jpeg": "JPEG",
    ".webp": "WEBP",
}
ALLOWED_CONTENT_TYPES = {
    "PNG": {"image/png"},
    "JPEG": {"image/jpeg", "image/pjpeg"},
    "WEBP": {"image/webp"},
}
LOGO_MAX_SIDE = 512
FAVICON_SIDE = 64


@dataclass(frozen=True)
class ProcessedImage:
    data: bytes
    hash: str


def _invalid(message: str, field: str = "file") -> ValidationError:
    return ValidationError({field: [message]})


def decode_image(
    upload: UploadedFile,
    *,
    max_bytes: int = MAX_UPLOAD_BYTES,
    field: str = "file",
) -> Image.Image:
    """
    Validate an uploaded PNG/JPEG/WebP image and return its decoded RGBA pixels.

    Checks extension, declared content type, real file contents (Pillow decodes it)
    and size. Callers re-encode the pixels, which drops metadata and anything hidden
    in the original file. Also used for bug report screenshots (``support``).
    """
    too_big = _("The image must be %(size)s MB or smaller.") % {
        "size": max_bytes // (1024 * 1024),
    }
    if upload.size is None or upload.size > max_bytes:
        raise _invalid(too_big, field)
    expected = ALLOWED_EXTENSIONS.get(PurePath(upload.name or "").suffix.lower())
    if expected is None:
        raise _invalid(_("Upload a PNG, JPEG or WebP image."), field)
    content_type = (upload.content_type or "").split(";")[0].strip().lower()
    if content_type not in ALLOWED_CONTENT_TYPES[expected]:
        raise _invalid(_("The file type does not match its extension."), field)

    raw = upload.read(max_bytes + 1)
    if len(raw) > max_bytes:
        raise _invalid(too_big, field)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw)) as probe:
                if probe.format != expected:
                    raise _invalid(
                        _("The file contents do not match its extension."),
                        field,
                    )
                width, height = probe.size
                if width * height > MAX_SOURCE_PIXELS:
                    raise _invalid(
                        _("The image is too large (max 4096 x 4096)."),
                        field,
                    )
                probe.verify()  # structural check; the image must be reopened after
            with Image.open(io.BytesIO(raw)) as image:
                image.seek(0)  # first frame only (animated images)
                image.load()
                return image.convert("RGBA")
    except ValidationError:
        raise
    except (
        UnidentifiedImageError,
        OSError,
        ValueError,
        SyntaxError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
    ):
        raise _invalid(_("The file is not a valid image."), field) from None


def process_image(upload: UploadedFile, asset: str) -> ProcessedImage:
    """Validate an uploaded logo/favicon and re-encode it as a fresh PNG."""
    pixels = decode_image(upload)

    if asset == "favicon":
        # Square canvas, image centered without distortion.
        pixels.thumbnail((FAVICON_SIDE, FAVICON_SIDE), Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", (FAVICON_SIDE, FAVICON_SIDE), (0, 0, 0, 0))
        offset = (
            (FAVICON_SIDE - pixels.width) // 2,
            (FAVICON_SIDE - pixels.height) // 2,
        )
        canvas.paste(pixels, offset)
        pixels = canvas
    else:
        pixels.thumbnail((LOGO_MAX_SIDE, LOGO_MAX_SIDE), Image.Resampling.LANCZOS)

    out = io.BytesIO()
    pixels.save(out, format="PNG", optimize=True)
    data = out.getvalue()
    return ProcessedImage(data=data, hash=hashlib.sha256(data).hexdigest()[:16])


# ---------------------------------------------------------------- resolution


@dataclass(frozen=True)
class AssetRef:
    source: str
    hash: str | None


@dataclass(frozen=True)
class ResolvedAppearance:
    """Effective values and where each one comes from."""

    values: dict[str, str | None]
    sources: dict[str, str]
    assets: dict[str, AssetRef]


def _configured(row: Appearance | None) -> dict[str, Any]:
    if row is None:
        return dict.fromkeys(APPEARANCE_FIELDS)
    return {name: getattr(row, name) for name in APPEARANCE_FIELDS}


def resolve(
    tenant_row: TenantAppearance | None,
    organization_row: OrganizationAppearance | None = None,
) -> ResolvedAppearance:
    """Pure function: Organization → Tenant → default, property by property."""
    layers = [
        (Source.ORGANIZATION, organization_row),
        (Source.TENANT, tenant_row),
    ]
    values: dict[str, str | None] = {}
    sources: dict[str, str] = {}
    for name in APPEARANCE_FIELDS:
        values[name], sources[name] = None, Source.DEFAULT
        for source, row in layers:
            value = getattr(row, name) if row is not None else None
            if value is not None:
                values[name], sources[name] = value, source
                break
    assets: dict[str, AssetRef] = {}
    for asset in APPEARANCE_ASSETS:
        assets[asset] = AssetRef(Source.DEFAULT, None)
        for source, row in layers:
            if row is not None and row.has_asset(asset):
                assets[asset] = AssetRef(source, getattr(row, f"{asset}_hash"))
                break
    return ResolvedAppearance(values=values, sources=sources, assets=assets)


# Image bytes are only loaded when an image is actually served.
_LIGHT = ("logo", "favicon")


def tenant_row(tenant: Tenant) -> TenantAppearance | None:
    return TenantAppearance.objects.defer(*_LIGHT).filter(tenant=tenant).first()


def organization_row(organization: Organization) -> OrganizationAppearance | None:
    return (
        OrganizationAppearance.objects.defer(*_LIGHT)
        .filter(organization=organization)
        .first()
    )


def asset_bytes(
    tenant: Tenant,
    organization: Organization | None,
    asset: str,
) -> bytes | None:
    """Effective image bytes for this scope (an Organization inherits the Tenant's)."""
    if organization is not None:
        row = (
            OrganizationAppearance.objects.filter(organization=organization)
            .only(asset)
            .first()
        )
        data = getattr(row, asset, None) if row else None
        if data is not None:
            return bytes(data)
    row = TenantAppearance.objects.filter(tenant=tenant).only(asset).first()
    data = getattr(row, asset, None) if row else None
    return bytes(data) if data is not None else None


def configured_values(row: Appearance | None) -> dict[str, Any]:
    values = _configured(row)
    for asset in APPEARANCE_ASSETS:
        values[asset] = row is not None and row.has_asset(asset)
    return values


# ---------------------------------------------------------------- writes


def _scope(scope: Tenant | Organization) -> tuple[Tenant, Organization | None]:
    if isinstance(scope, Organization):
        return scope.tenant, scope
    return scope, None


def _locked_row(scope: Tenant | Organization) -> Appearance:
    """The scope's row, created on first write, locked for this transaction."""
    if isinstance(scope, Organization):
        OrganizationAppearance.objects.get_or_create(organization=scope)
        return (
            OrganizationAppearance.objects.select_for_update()
            .defer(*_LIGHT)
            .get(organization=scope)
        )
    TenantAppearance.objects.get_or_create(tenant=scope)
    return TenantAppearance.objects.select_for_update().defer(*_LIGHT).get(tenant=scope)


def _audit(
    scope: Tenant | Organization,
    row: Appearance,
    actor: User,
    action: str,
    details: dict[str, Any],
) -> None:
    tenant, organization = _scope(scope)
    record_activity(
        tenant=tenant,
        organization=organization,
        actor=actor,
        action=action,
        target=row,
        target_name=f"{scope.name} appearance",
        details={"scope": "organization" if organization else "tenant", **details},
    )


@transaction.atomic
def update_appearance(
    *,
    actor: User,
    scope: Tenant | Organization,
    values: dict[str, str | None],
) -> Appearance:
    """Apply already-cleaned values (``None`` = reset to inherited)."""
    row = _locked_row(scope)
    changes = {
        name: [getattr(row, name), value]
        for name, value in values.items()
        if getattr(row, name) != value
    }
    if not changes:
        return row
    for name, (_old, new) in changes.items():
        setattr(row, name, new)
    row.updated_by = actor
    row.save(update_fields=[*changes, "updated_by", "updated_at"])
    _audit(scope, row, actor, "appearance.updated", {"changes": changes})
    return row


@transaction.atomic
def reset_appearance(*, actor: User, scope: Tenant | Organization) -> None:
    """Remove every customization of this scope (everything inherits again)."""
    row = _locked_row(scope)
    configured = [name for name in APPEARANCE_FIELDS if getattr(row, name) is not None]
    configured += [asset for asset in APPEARANCE_ASSETS if row.has_asset(asset)]
    if configured:
        _audit(scope, row, actor, "appearance.reset", {"reset": configured})
    row.delete()


@transaction.atomic
def set_asset(
    *,
    actor: User,
    scope: Tenant | Organization,
    asset: str,
    image: ProcessedImage,
) -> Appearance:
    row = _locked_row(scope)
    previous = getattr(row, f"{asset}_hash")
    if previous == image.hash:
        return row
    setattr(row, asset, image.data)
    setattr(row, f"{asset}_hash", image.hash)
    row.updated_by = actor
    row.save(update_fields=[asset, f"{asset}_hash", "updated_by", "updated_at"])
    # Never the image itself in the audit trail: only that it changed.
    _audit(
        scope,
        row,
        actor,
        "appearance.updated",
        {"changes": {asset: [previous, image.hash]}},
    )
    return row


@transaction.atomic
def remove_asset(
    *,
    actor: User,
    scope: Tenant | Organization,
    asset: str,
) -> Appearance:
    row = _locked_row(scope)
    previous = getattr(row, f"{asset}_hash")
    if previous is None:
        return row
    setattr(row, asset, None)
    setattr(row, f"{asset}_hash", None)
    row.updated_by = actor
    row.save(update_fields=[asset, f"{asset}_hash", "updated_by", "updated_at"])
    _audit(
        scope,
        row,
        actor,
        "appearance.updated",
        {"changes": {asset: [previous, None]}},
    )
    return row
