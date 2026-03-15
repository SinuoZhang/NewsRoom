from __future__ import annotations

import csv
from datetime import datetime, timedelta
from io import StringIO
from typing import Any

import requests

from app.core.config import get_settings

_cache: dict[str, tuple[datetime, dict[str, Any]]] = {}


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

    value_col = _detect_value_column(reader.fieldnames or [])
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


def _detect_value_column(fieldnames: list[str]) -> str:
    reserved = {"Entity", "Code", "Year", "Unit"}
    candidates = [f for f in fieldnames if f and f not in reserved]
    if not candidates:
        return "Value"
    return candidates[-1]
