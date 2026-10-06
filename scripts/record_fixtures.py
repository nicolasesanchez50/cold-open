#!/usr/bin/env python3
"""Record live Qloo responses into fixtures/ so the hosted demo runs keyless.

The Devpost brief requires the demo to be fully published and usable without
private access, and the starter-kit rule says the event key must never ship in
a web page. The compromise this script implements: fixtures are RECORDED LIVE
RESPONSES (unedited except for field selection), not invented numbers, and the
page labels them as recorded. Visitors who paste their own event key get live
calls through the exact same request shapes.

Per subject it records the three ops the pipeline runs:
    search      GET /search?query=...                      -> search__<slug>.json
    find_tags   GET /v2/tags?filter.query=...              -> find_tags__<slug>.json
    recommend   GET /v2/insights?signal.interests.entities=<id>
                                                              -> recommend__<slug>__<cat>.json
    plus fixtures/index.json, a manifest the demo reads for its recorded-subject hint.

Usage:
    QLOO_API_KEY=hack_... python3 scripts/record_fixtures.py
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE = "https://hackathon.api.qloo.com"
FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"
KEY = os.environ.get("QLOO_API_KEY", "")

# Mirrors INSIGHTS_TYPE in src/core/qloo_shapes.mjs (supported filter.type
# values only — see the developer guide's "Supported Entity Types").
CATEGORIES = {
    "brands": "urn:entity:brand",
    "music": "urn:entity:artist",
    "podcasts": "urn:entity:podcast",
    "dining": "urn:entity:place",
    "travel": "urn:entity:destination",
}

SUBJECTS = ["Patagonia", "Red Bull", "Oatly", "Aesop", "Mezcal"]
BRAND_TYPE = "urn:entity:brand"


def slug(value: str) -> str:
    # Mirrors fixtureName() in both transports.
    out = "".join(c.lower() if c.isalnum() else "_" for c in value)
    while "__" in out:
        out = out.replace("__", "_")
    return out.strip("_")


def get(path: str, params: dict) -> dict:
    url = f"{BASE}{path}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"X-Api-Key": KEY, "Accept": "application/json"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=75) as res:
                time.sleep(0.3)  # stay under the 5 req/s limit
                payload = json.loads(res.read().decode())
                if not isinstance(payload, dict):
                    raise SystemExit(f"GET {path}: expected a JSON object response")
                return payload
        except urllib.error.HTTPError as e:
            body = e.read().decode()[:300]
            if e.code in (429, 504) and attempt < 2:
                time.sleep(3 * (attempt + 1))
                continue
            raise SystemExit(f"GET {path} -> HTTP {e.code}: {body}")
    raise SystemExit(f"GET {path}: retries exhausted")


def normalize_entity(row: dict) -> dict:
    return {
        "name": row.get("name"),
        "entity_id": row.get("entity_id"),
        "types": row.get("types") or [],
    }


def compact_tag(tag: dict) -> dict:
    return {
        "id": tag.get("id") or tag.get("tag_id"),
        "name": tag.get("name"),
        "category": tag.get("category") or tag.get("type"),
        "type": tag.get("type") or tag.get("subtype"),
        "popularity": tag.get("popularity"),
    }


def evidence_for(entity: dict) -> dict | None:
    # Mirrors evidenceFor() in src/core/qloo_shapes.mjs: only fields the
    # response actually carries are surfaced — never invented.
    explain = entity.get("query", {}).get("explainability") or entity.get("explainability")
    evidence: dict = {}
    correlated = (
        (explain or {}).get("correlated_categories")
        or entity.get("properties", {}).get("correlated_categories")
        or entity.get("correlated_categories")
    )
    if isinstance(correlated, list) and correlated:
        evidence["correlated_categories"] = correlated
    overlap = (explain or {}).get("audience_overlap") or entity.get("properties", {}).get(
        "audience_overlap"
    )
    if overlap is not None:
        evidence["audience_overlap"] = overlap
    return evidence or None


def write(name: str, payload: dict) -> None:
    (FIXTURES / name).write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    print(f"  wrote {name}")


def record_subject(subject: str) -> None:
    print(f"[{subject}]")
    key = slug(subject)

    # 1. entity resolution — this id is the Insights signal
    search = get("/search", {"query": subject})
    rows = [normalize_entity(r) for r in search.get("results", []) if r.get("entity_id")]
    rows = [r for r in rows if r["name"]][:5]
    if not rows:
        raise SystemExit(f"no entity resolved for {subject!r}")
    write(f"search__{key}.json", {"results": rows})

    chosen = next((r for r in rows if BRAND_TYPE in r["types"]), rows[0])
    print(f"  chosen {chosen['name']} ({chosen['entity_id']}) {chosen['types']}")

    # 2. tag resolution — the audit trail shown next to the entity pick
    tags_res = get(
        "/v2/tags",
        {"filter.query": subject, "feature.semantic_search": "true", "take": 5},
    )
    tags = [compact_tag(t) for t in tags_res.get("results", {}).get("tags", [])]
    tags = [t for t in tags if t.get("id")][:5]
    if tags:
        write(f"find_tags__{key}.json", {"tags": tags})

    # 3. one Insights request per bucket category, entity signal
    for category, filter_type in CATEGORIES.items():
        res = get(
            "/v2/insights",
            {
                "filter.type": filter_type,
                "signal.interests.entities": chosen["entity_id"],
                "take": 10,
                "feature.explainability": "true",
            },
        )
        entities = res.get("results", {}).get("entities", [])
        leads = [
            {
                "name": e.get("name"),
                "affinity": (e.get("query") or {}).get("affinity") or 0,
                "category": category,
                "evidence": evidence_for(e),
            }
            for e in entities
            if e.get("name")
        ]
        if not leads:
            raise SystemExit(f"empty {category} response for {subject!r} — refusing to record it")
        write(f"recommend__{key}__{category}.json", {"recommendations": leads})


def main() -> None:
    if not KEY:
        raise SystemExit("QLOO_API_KEY is not set")
    FIXTURES.mkdir(exist_ok=True)

    # Drop the previous generation so a subject removed here cannot leave
    # stale recommendations behind.
    for pattern in ("search__*.json", "find_tags__*.json", "recommend__*.json"):
        for stale in FIXTURES.glob(pattern):
            stale.unlink()

    for subject in SUBJECTS:
        record_subject(subject)

    stamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    (FIXTURES / "index.json").write_text(
        json.dumps(
            {
                "recorded_on": stamp,
                "base": BASE,
                "subjects": SUBJECTS,
                "note": "Recorded live responses, field selection only. "
                "Regenerate with scripts/record_fixtures.py",
            },
            indent=2,
        )
        + "\n"
    )
    (FIXTURES / "RECORDED.md").write_text(
        "# Recorded Qloo responses\n\n"
        f"Captured {stamp} from `{BASE}` by `scripts/record_fixtures.py` against the "
        "hackathon event API. Field selection only — no value is edited and nothing "
        "is invented. Re-record with:\n\n"
        "```sh\nQLOO_API_KEY=<your event key> python3 scripts/record_fixtures.py\n```\n\n"
        "The hosted demo serves these in RECORDED mode (no key needed) and switches "
        "to live calls as soon as a visitor saves an event key.\n"
    )
    print(f"done — {stamp}")


if __name__ == "__main__":
    main()
