import datetime as dt

import pytest

from nekkoguard.support import content


@pytest.fixture(autouse=True)
def _fresh_cache():
    content.terms.cache_clear()
    content.releases.cache_clear()
    yield
    content.terms.cache_clear()
    content.releases.cache_clear()


def test_repository_terms_are_a_clearly_marked_draft():
    terms = content.terms()
    assert terms["status"] == "draft"
    assert terms["effective_date"] is None
    assert terms["sections"]
    assert all(s["id"] and s["title"] for s in terms["sections"])


def test_repository_releases_load():
    releases = content.releases()
    assert releases[0]["version"] == "0.1.0-alpha.1"
    assert releases[0]["date"] == "2026-11-14"


def _fake(monkeypatch, data):
    monkeypatch.setattr(content, "_load", lambda name: data)


def test_releases_newest_first_and_empty_categories_hidden(monkeypatch):
    _fake(
        monkeypatch,
        {
            "releases": [
                {
                    "version": "1.0.0",
                    "date": dt.date(2027, 1, 1),
                    "type": "stable",
                    "changes": {"fixes": ["A fix."], "features": []},
                },
                {
                    "version": "1.1.0",
                    "date": dt.date(2027, 2, 1),
                    "type": "stable",
                    "changes": {"features": ["New."]},
                },
            ],
        },
    )
    releases = content.releases()
    assert [r["version"] for r in releases] == ["1.1.0", "1.0.0"]
    assert releases[1]["changes"] == {"fixes": ["A fix."]}


@pytest.mark.parametrize(
    "release",
    [
        {"version": "1", "date": "2027-01-01", "type": "stable"},  # not a TOML date
        {"version": "1", "date": dt.date(2027, 1, 1), "type": "beta"},
        {
            "version": "1",
            "date": dt.date(2027, 1, 1),
            "type": "stable",
            "changes": {"misc": ["x"]},
        },
    ],
)
def test_malformed_releases_fail_loudly(monkeypatch, release):
    _fake(monkeypatch, {"releases": [release]})
    with pytest.raises(content.ContentError):
        content.releases()


def test_published_terms_need_an_effective_date(monkeypatch):
    _fake(
        monkeypatch,
        {"title": "T", "version": "1", "status": "published", "sections": []},
    )
    with pytest.raises(content.ContentError):
        content.terms()
