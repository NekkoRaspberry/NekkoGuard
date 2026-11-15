"""
Terms of Service and release notes, read from the TOML files in ``content/``.

The files in the repository are the single source of truth: a developer updates
them with each release (no database rows, no migrations). They are parsed once per
process and validated, so a malformed file fails loudly in tests and at startup of
the first request instead of rendering half a page.
"""

from __future__ import annotations

import datetime as dt
import tomllib
from functools import cache
from pathlib import Path
from typing import Any

CONTENT_DIR = Path(__file__).resolve().parent / "content"

TERMS_STATUSES = {"draft", "published"}
RELEASE_TYPES = {"stable", "pre-release"}
#: Changelog categories, in display order.
CHANGE_CATEGORIES = ("breaking", "security", "features", "improvements", "fixes")


class ContentError(ValueError):
    """A content file is malformed (a developer error, never user input)."""


def _load(name: str) -> dict[str, Any]:
    with (CONTENT_DIR / name).open("rb") as handle:
        return tomllib.load(handle)


def _text(value: Any, where: str, *, required: bool = True) -> str:
    if not isinstance(value, str) or (required and not value.strip()):
        msg = f"{where}: expected a non-empty string"
        raise ContentError(msg)
    return value.strip()


def _strings(value: Any, where: str) -> list[str]:
    if value is None:
        return []
    if not isinstance(value, list):
        msg = f"{where}: expected a list of strings"
        raise ContentError(msg)
    return [_text(item, where) for item in value]


@cache
def terms() -> dict[str, Any]:
    data = _load("terms.toml")
    status = _text(data.get("status"), "terms.status")
    if status not in TERMS_STATUSES:
        msg = f"terms.status must be one of {sorted(TERMS_STATUSES)}"
        raise ContentError(msg)
    effective = data.get("effective_date") or None
    if effective is not None:
        try:
            effective = dt.date.fromisoformat(str(effective)).isoformat()
        except ValueError:
            msg = "terms.effective_date must be YYYY-MM-DD"
            raise ContentError(msg) from None
    if status == "published" and effective is None:
        msg = "published terms need an effective_date"
        raise ContentError(msg)
    sections = []
    for index, section in enumerate(data.get("sections") or []):
        where = f"terms.sections[{index}]"
        sections.append(
            {
                "id": _text(section.get("id"), f"{where}.id"),
                "title": _text(section.get("title"), f"{where}.title"),
                "paragraphs": _strings(
                    section.get("paragraphs"),
                    f"{where}.paragraphs",
                ),
            },
        )
    return {
        "title": _text(data.get("title"), "terms.title"),
        "version": _text(data.get("version"), "terms.version"),
        "status": status,
        "effective_date": effective,
        "summary": _text(data.get("summary", ""), "terms.summary", required=False),
        "sections": sections,
    }


@cache
def releases() -> list[dict[str, Any]]:
    """Published releases, newest first. Empty categories are left out."""
    result = []
    for index, release in enumerate(_load("releases.toml").get("releases") or []):
        where = f"releases[{index}]"
        date = release.get("date")
        if not isinstance(date, dt.date):
            msg = f"{where}.date must be a TOML date (YYYY-MM-DD)"
            raise ContentError(msg)
        kind = _text(release.get("type"), f"{where}.type")
        if kind not in RELEASE_TYPES:
            msg = f"{where}.type must be one of {sorted(RELEASE_TYPES)}"
            raise ContentError(msg)
        changes = release.get("changes") or {}
        unknown = set(changes) - set(CHANGE_CATEGORIES)
        if unknown:
            msg = f"{where}.changes: unknown categories {sorted(unknown)}"
            raise ContentError(msg)
        result.append(
            {
                "version": _text(release.get("version"), f"{where}.version"),
                "date": date.isoformat(),
                "type": kind,
                "summary": _text(
                    release.get("summary", ""),
                    f"{where}.summary",
                    required=False,
                ),
                "changes": {
                    category: entries
                    for category in CHANGE_CATEGORIES
                    if (
                        entries := _strings(
                            changes.get(category),
                            f"{where}.changes.{category}",
                        )
                    )
                },
            },
        )
    versions = [r["version"] for r in result]
    if len(versions) != len(set(versions)):
        msg = "releases: duplicate version"
        raise ContentError(msg)
    return sorted(result, key=lambda r: r["date"], reverse=True)
