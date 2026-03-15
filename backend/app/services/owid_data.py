from __future__ import annotations

import csv
import random
import re
from datetime import datetime, timedelta
from io import StringIO
from typing import Any

import requests

from app.core.config import get_settings

_cache: dict[str, tuple[datetime, dict[str, Any]]] = {}
_sitemap_cache: tuple[datetime, list[str]] | None = None


def get_owid_series(indicator: str, entity: str | None = None, limit: int = 240) -> dict[str, Any]:
    indicator = (indicator or "").strip()
    if not indicator:
        raise ValueError("indicator is required")

    settings = get_settings()
    base = settings.owid_base_url.rstrip("/")
    source_url = f"{base}/{indicator}.csv"
    cache_key = f"{indicator}|{entity or ''}|{limit}"

    hit = _cache.get(cache_key)
    if hit and (datetime.utcnow() - hit[0]) < timedelta(minutes=10):
        return hit[1]

    response = requests.get(source_url, timeout=20)
    response.raise_for_status()

    reader = csv.DictReader(StringIO(response.text))
    rows = list(reader)
    if not rows:
        out = {
            "indicator": indicator,
            "entity": entity,
            "source_url": source_url,
            "unit": None,
            "points": [],
            "fetched_at": datetime.utcnow().isoformat(),
        }
        _cache[cache_key] = (datetime.utcnow(), out)
        return out

    value_col = _detect_value_column(list(reader.fieldnames or []))
    unit = rows[0].get("Unit") or None

    filtered: list[dict[str, Any]] = []
    for r in rows:
        entity_name = (r.get("Entity") or "").strip()
        if entity and entity_name.lower() != entity.lower():
            continue

        year_raw = (r.get("Year") or "").strip()
        value_raw = (r.get(value_col) or "").strip()
        if not year_raw or not value_raw:
            continue

        try:
            year = int(float(year_raw))
            value = float(value_raw)
        except Exception:
            continue

        filtered.append(
            {
                "entity": entity_name,
                "code": (r.get("Code") or "").strip() or None,
                "year": year,
                "value": value,
            }
        )

    filtered.sort(key=lambda x: (x["entity"], x["year"]))
    if limit > 0:
        filtered = filtered[-limit:]

    out = {
        "indicator": indicator,
        "entity": entity,
        "source_url": source_url,
        "unit": unit,
        "points": filtered,
        "fetched_at": datetime.utcnow().isoformat(),
    }
    _cache[cache_key] = (datetime.utcnow(), out)
    return out


def get_owid_random_modules(count: int = 10, points_limit: int = 40) -> list[dict[str, Any]]:
    slugs = _get_owid_grapher_slugs()
    if not slugs:
        return []

    target = max(1, min(count, 20))
    modules: list[dict[str, Any]] = []
    seen: set[str] = set()

    tries = 0
    max_tries = target * 12
    while len(modules) < target and tries < max_tries:
        tries += 1
        slug = random.choice(slugs)
        if slug in seen:
            continue
        seen.add(slug)
        try:
            module = _build_random_module_from_slug(slug, points_limit)
        except Exception:
            continue
        if module:
            modules.append(module)

    return modules


def _build_random_module_from_slug(slug: str, points_limit: int) -> dict[str, Any] | None:
    series = get_owid_series(indicator=slug, entity=None, limit=0)
    points = series.get("points") or []
    if not points:
        return None

    grouped: dict[str, list[dict[str, Any]]] = {}
    for p in points:
        ent = str(p.get("entity") or "").strip()
        if not ent:
            continue
        grouped.setdefault(ent, []).append(p)

    candidates = [k for k, vals in grouped.items() if len(vals) >= 2]
    if not candidates:
        return None

    entity = random.choice(candidates)
    entity_points = sorted(grouped[entity], key=lambda x: x.get("year", 0))[-max(2, points_limit):]

    return {
        "indicator": slug,
        "entity": entity,
        "title": _humanize_slug(slug),
        "source_url": f"{get_settings().owid_base_url.rstrip('/')}/{slug}.csv",
        "page_url": f"https://ourworldindata.org/grapher/{slug}?tab=chart",
        "unit": series.get("unit"),
        "points": entity_points,
        "fetched_at": datetime.utcnow().isoformat(),
    }


def _get_owid_grapher_slugs() -> list[str]:
    global _sitemap_cache
    now = datetime.utcnow()
    if _sitemap_cache and (now - _sitemap_cache[0]) < timedelta(hours=6):
        return _sitemap_cache[1]

    text = requests.get("https://ourworldindata.org/sitemap.xml", timeout=25).text
    urls = re.findall(r"https://ourworldindata\.org/grapher/([a-z0-9\-]+)", text)
    slugs = sorted(set(urls))
    _sitemap_cache = (now, slugs)
    return slugs


def _humanize_slug(slug: str) -> str:
    if not slug:
        return "OWID Indicator"
    words = [w for w in slug.replace("_", "-").split("-") if w]
    return " ".join(w.capitalize() for w in words)


def _detect_value_column(fieldnames: list[str]) -> str:
    reserved = {"Entity", "Code", "Year", "Unit"}
    candidates = [f for f in fieldnames if f and f not in reserved]
    if not candidates:
        return "Value"
    return candidates[-1]
