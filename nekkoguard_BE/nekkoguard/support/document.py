"""
Terms of Service documents: validation, sanitization and hashing of the rich-text
content (ProseMirror / Tiptap JSON).

The JSON is the only stored representation. It is never turned into HTML on the
server, and the frontend renders it node by node (no raw HTML), so the safety rules
live here: only the node types, marks and attributes below are accepted, links may
only use safe protocols or point to an anchor in the same document, and heading ids
are made unique and stable (they are the targets of the table of contents).
"""

from __future__ import annotations

import hashlib
import json
import re
from typing import Any

from django.utils.translation import gettext_lazy as _
from rest_framework.exceptions import ValidationError

MAX_DOCUMENT_BYTES = 512 * 1024
MAX_NODES = 20_000
MAX_DEPTH = 24
MAX_TEXT_LENGTH = 20_000
TITLE_MAX_LENGTH = 150

_ALIGNMENTS = {"left", "center", "right", "justify"}
_HEADING_ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,79}$")
_SLUG_STRIP = re.compile(r"[^a-z0-9]+")
_SAFE_SCHEMES = ("https://", "http://", "mailto:")


def _align(value: Any) -> str | None:
    return value if value in _ALIGNMENTS else None


def _positive_int(value: Any, default: int = 1, maximum: int = 1000) -> int:
    return value if isinstance(value, int) and 1 <= value <= maximum else default


#: node type → attribute cleaners (anything not listed is dropped).
NODE_ATTRS: dict[str, dict[str, Any]] = {
    "doc": {},
    "paragraph": {"textAlign": _align},
    "heading": {"textAlign": _align},  # level and id are handled separately
    "text": {},
    "hardBreak": {},
    "bulletList": {},
    "orderedList": {"start": _positive_int},
    "listItem": {},
    "blockquote": {},
    "horizontalRule": {},
    "table": {},
    "tableRow": {},
    "tableHeader": {"colspan": _positive_int, "rowspan": _positive_int},
    "tableCell": {"colspan": _positive_int, "rowspan": _positive_int},
}
MARKS = {"bold", "italic", "underline", "strike", "link"}
_LEAVES = {"text", "hardBreak", "horizontalRule"}


def safe_href(value: Any) -> str | None:
    """https/http/mailto URLs or ``#anchor``; anything else (javascript:) is refused."""
    if not isinstance(value, str):
        return None
    href = value.strip()
    if len(href) > 2000 or any(ord(c) < 32 for c in href):  # noqa: PLR2004
        return None
    if href.startswith("#"):
        return href if _HEADING_ID.match(href[1:]) else None
    if href.lower().startswith(_SAFE_SCHEMES) and len(href) > len("mailto:"):
        return href
    return None


def slugify_heading(text: str) -> str:
    slug = _SLUG_STRIP.sub("-", text.lower()).strip("-")[:60].strip("-")
    return slug or "section"


def _invalid(message: str) -> ValidationError:
    return ValidationError({"content": [message]})


class _Cleaner:
    def __init__(self) -> None:
        self.nodes = 0
        self.heading_ids: set[str] = set()

    def heading_id(self, wanted: Any, text: str) -> str:
        base = wanted if isinstance(wanted, str) and _HEADING_ID.match(wanted) else None
        base = base or slugify_heading(text)
        candidate, n = base, 2
        while candidate in self.heading_ids:
            candidate = f"{base[:74]}-{n}"
            n += 1
        self.heading_ids.add(candidate)
        return candidate

    def marks(self, marks: Any) -> list[dict[str, Any]]:
        if marks is None:
            return []
        if not isinstance(marks, list):
            raise _invalid(_("Invalid formatting."))
        cleaned = []
        for mark in marks:
            kind = mark.get("type") if isinstance(mark, dict) else None
            if kind not in MARKS:
                raise _invalid(_("Unsupported formatting: %(type)s.") % {"type": kind})
            if kind == "link":
                href = safe_href((mark.get("attrs") or {}).get("href"))
                if href is None:
                    raise _invalid(
                        _("Links must start with https://, http://, mailto: or #."),
                    )
                cleaned.append({"type": "link", "attrs": {"href": href}})
            else:
                cleaned.append({"type": kind})
        return cleaned

    def text(self, node: dict[str, Any]) -> dict[str, Any]:
        text = node.get("text")
        if not isinstance(text, str) or not text or len(text) > MAX_TEXT_LENGTH:
            raise _invalid(_("Invalid text."))
        out: dict[str, Any] = {"type": "text", "text": text}
        marks = self.marks(node.get("marks"))
        if marks:
            out["marks"] = marks
        return out

    def children(self, node: dict[str, Any], kind: str, depth: int) -> list:
        children = node.get("content") or []
        if not isinstance(children, list) or (kind in _LEAVES and children):
            raise _invalid(_("Invalid content."))
        return [self.node(child, depth + 1) for child in children]

    def node(self, node: Any, depth: int) -> dict[str, Any]:
        self.nodes += 1
        if self.nodes > MAX_NODES or depth > MAX_DEPTH:
            raise _invalid(_("The document is too large or too deeply nested."))
        if not isinstance(node, dict) or node.get("type") not in NODE_ATTRS:
            kind = node.get("type") if isinstance(node, dict) else None
            raise _invalid(_("Unsupported content: %(type)s.") % {"type": kind})
        kind = node["type"]
        if kind == "text":
            return self.text(node)
        attrs_in = node.get("attrs") or {}
        if not isinstance(attrs_in, dict):
            raise _invalid(_("Invalid attributes."))
        attrs = {
            name: value
            for name, clean in NODE_ATTRS[kind].items()
            if (value := clean(attrs_in.get(name))) is not None
        }
        out: dict[str, Any] = {"type": kind}
        children = self.children(node, kind, depth)
        if children:
            out["content"] = children
        if kind == "heading":
            level = attrs_in.get("level")
            if level not in (1, 2, 3):
                raise _invalid(_("Headings must be level 1, 2 or 3."))
            attrs["level"] = level
            attrs["id"] = self.heading_id(attrs_in.get("id"), plain_text(out))
        if attrs:
            out["attrs"] = attrs
        return out


def plain_text(node: dict[str, Any]) -> str:
    if node.get("type") == "text":
        return node.get("text", "")
    return "".join(plain_text(child) for child in node.get("content", []))


def clean_document(content: Any) -> dict[str, Any]:
    """Validate and normalize a document (``ValidationError`` on field ``content``)."""
    if not isinstance(content, dict) or content.get("type") != "doc":
        raise _invalid(_("The document is not valid."))
    if len(json.dumps(content)) > MAX_DOCUMENT_BYTES:
        raise _invalid(_("The document is too large (max 512 KB)."))
    return _Cleaner().node(content, 0)


def is_empty(content: dict[str, Any]) -> bool:
    return not plain_text(content).strip()


def content_hash(title: str, content: dict[str, Any]) -> str:
    """SHA-256 over the title and the canonical JSON: what a user accepted, exactly."""
    canonical = json.dumps(
        {"title": title, "content": content},
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )
    return hashlib.sha256(canonical.encode()).hexdigest()


def document_from_sections(sections: list[dict[str, Any]]) -> dict[str, Any]:
    """Starting document for a Tenant's first draft (from content/terms.toml)."""
    content: list[dict[str, Any]] = []
    for section in sections:
        content.append(
            {
                "type": "heading",
                "attrs": {"level": 1, "id": section["id"]},
                "content": [{"type": "text", "text": section["title"]}],
            },
        )
        content.extend(
            {"type": "paragraph", "content": [{"type": "text", "text": paragraph}]}
            for paragraph in section["paragraphs"]
        )
    return clean_document({"type": "doc", "content": content})
