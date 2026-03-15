from datetime import datetime, timedelta
from xml.etree import ElementTree as ET

import requests

YAHOO_QUOTE_URL = "https://query1.finance.yahoo.com/v7/finance/quote"
YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/HG=F"
STOOQ_COPPER_URL = "https://stooq.com/q/l/?s=hg.f&i=5"
ECB_FX_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml"
LBMA_GOLD_PM_URL = "https://prices.lbma.org.uk/json/gold_pm.json"
LBMA_SILVER_URL = "https://prices.lbma.org.uk/json/silver.json"

SYMBOL_CONFIG = [
    {"symbol": "XAUUSD=X", "key": "gold_usd", "label": "Gold", "unit": "USD/oz"},
    {"symbol": "XAGUSD=X", "key": "silver_usd", "label": "Silver", "unit": "USD/oz"},
    {"symbol": "HG=F", "key": "copper_usd", "label": "Copper", "unit": "USD/lb"},
    {"symbol": "EURCNY=X", "key": "eur_cny", "label": "EUR/CNY", "unit": "CNY"},
    {"symbol": "USDCNY=X", "key": "usd_cny", "label": "USD/CNY", "unit": "CNY"},
]

_cache: dict = {"at": None, "data": None}


def get_market_snapshot() -> dict:
    now = datetime.utcnow()
    cached_at = _cache.get("at")
    if cached_at and _cache.get("data") and (now - cached_at) < timedelta(seconds=45):
        return _cache["data"]

    try:
        fx = _safe_call(_fetch_ecb_fx, default={"eur_cny": None, "usd_cny": None})
        metals = _safe_call(_fetch_lbma_metals, default={"gold_usd": None, "silver_usd": None})
        copper = _safe_call(_fetch_yahoo_copper, default={"price": None, "change_pct": None, "source": "Yahoo", "source_url": None})

        items = [
            {
                "key": "gold_usd",
                "label": "Gold",
                "symbol": "LBMA Gold PM",
                "source": "LBMA",
                "source_url": LBMA_GOLD_PM_URL,
                "price": metals.get("gold_usd"),
                "unit": "USD/oz",
                "change_pct": None,
                "updated_at": datetime.utcnow().isoformat(),
            },
            {
                "key": "silver_usd",
                "label": "Silver",
                "symbol": "LBMA Silver",
                "source": "LBMA",
                "source_url": LBMA_SILVER_URL,
                "price": metals.get("silver_usd"),
                "unit": "USD/oz",
                "change_pct": None,
                "updated_at": datetime.utcnow().isoformat(),
            },
            {
                "key": "copper_usd",
                "label": "Copper",
                "symbol": "HG=F",
                "source": copper.get("source") or "Yahoo",
                "source_url": copper.get("source_url"),
                "price": copper.get("price"),
                "unit": "USD/lb",
                "change_pct": copper.get("change_pct"),
                "updated_at": datetime.utcnow().isoformat(),
            },
            {
                "key": "eur_cny",
                "label": "EUR/CNY",
                "symbol": "ECB",
                "source": "ECB",
                "source_url": ECB_FX_URL,
                "price": fx.get("eur_cny"),
                "unit": "CNY",
                "change_pct": None,
                "updated_at": datetime.utcnow().isoformat(),
            },
            {
                "key": "usd_cny",
                "label": "USD/CNY",
                "symbol": "ECB-derived",
                "source": "ECB",
                "source_url": ECB_FX_URL,
                "price": fx.get("usd_cny"),
                "unit": "CNY",
                "change_pct": None,
                "updated_at": datetime.utcnow().isoformat(),
            },
        ]

        data = {"source": "ecb+lbma+yahoo", "updated_at": datetime.utcnow().isoformat(), "items": items}
        _cache["at"] = now
        _cache["data"] = data
        return data
    except Exception:
        if _cache.get("data"):
            return _cache["data"]
        return {"source": "unavailable", "updated_at": datetime.utcnow().isoformat(), "items": []}


def _fetch_ecb_fx() -> dict:
    response = requests.get(ECB_FX_URL, timeout=12)
    response.raise_for_status()
    root = ET.fromstring(response.text)

    rates: dict[str, float] = {}
    for cube in root.iter():
        currency = cube.attrib.get("currency")
        rate = cube.attrib.get("rate")
        if currency and rate:
            try:
                rates[currency] = float(rate)
            except Exception:
                continue

    eur_cny = rates.get("CNY")
    usd_per_eur = rates.get("USD")
    usd_cny = (eur_cny / usd_per_eur) if eur_cny and usd_per_eur else None
    return {"eur_cny": eur_cny, "usd_cny": usd_cny}


def _fetch_lbma_metals() -> dict:
    gold_data = requests.get(LBMA_GOLD_PM_URL, timeout=16)
    gold_data.raise_for_status()
    gold_rows = gold_data.json()
    gold_usd = _extract_lbma_usd(gold_rows)

    silver_data = requests.get(LBMA_SILVER_URL, timeout=16)
    silver_data.raise_for_status()
    silver_rows = silver_data.json()
    silver_usd = _extract_lbma_usd(silver_rows)

    return {"gold_usd": gold_usd, "silver_usd": silver_usd}


def _extract_lbma_usd(rows: list) -> float | None:
    if not rows:
        return None
    last = rows[-1]
    values = last.get("v") if isinstance(last, dict) else None
    if isinstance(values, list) and values:
        try:
            return float(values[0])
        except Exception:
            return None
    return None


def _fetch_yahoo_copper() -> dict:
    quote = _safe_call(_fetch_yahoo_quote_copper, default={"price": None, "change_pct": None, "source": None, "source_url": None})
    if quote.get("price") is not None:
        return quote

    chart = _safe_call(_fetch_yahoo_chart_copper, default={"price": None, "change_pct": None, "source": None, "source_url": None})
    if chart.get("price") is not None:
        return chart

    stooq = _safe_call(_fetch_stooq_copper, default={"price": None, "change_pct": None, "source": None, "source_url": None})
    return stooq


def _fetch_yahoo_quote_copper() -> dict:
    response = requests.get(YAHOO_QUOTE_URL, params={"symbols": "HG=F"}, timeout=10)
    response.raise_for_status()
    payload = response.json()
    rows = payload.get("quoteResponse", {}).get("result", [])
    if not rows:
        return {"price": None, "change_pct": None, "source": "Yahoo Quote", "source_url": f"{YAHOO_QUOTE_URL}?symbols=HG=F"}
    row = rows[0]
    return {
        "price": row.get("regularMarketPrice"),
        "change_pct": row.get("regularMarketChangePercent"),
        "source": "Yahoo Quote",
        "source_url": f"{YAHOO_QUOTE_URL}?symbols=HG=F",
    }


def _fetch_yahoo_chart_copper() -> dict:
    response = requests.get(YAHOO_CHART_URL, params={"range": "1d", "interval": "1m"}, timeout=12)
    response.raise_for_status()
    payload = response.json()
    result = payload.get("chart", {}).get("result", [])
    if not result:
        return {"price": None, "change_pct": None, "source": "Yahoo Chart", "source_url": f"{YAHOO_CHART_URL}?range=1d&interval=1m"}
    meta = result[0].get("meta", {})
    return {
        "price": meta.get("regularMarketPrice"),
        "change_pct": meta.get("regularMarketChangePercent"),
        "source": "Yahoo Chart",
        "source_url": f"{YAHOO_CHART_URL}?range=1d&interval=1m",
    }


def _fetch_stooq_copper() -> dict:
    response = requests.get(STOOQ_COPPER_URL, timeout=10, headers={"User-Agent": "Mozilla/5.0"})
    response.raise_for_status()
    row = response.text.strip()
    if not row:
        return {"price": None, "change_pct": None, "source": "Stooq", "source_url": STOOQ_COPPER_URL}

    parts = row.split(",")
    if len(parts) < 7:
        return {"price": None, "change_pct": None, "source": "Stooq", "source_url": STOOQ_COPPER_URL}

    # Symbol,Date,Time,Open,High,Low,Close,Volume
    try:
        open_px = float(parts[3]) if parts[3] else None
        close_px = float(parts[6]) if parts[6] else None
    except Exception:
        return {"price": None, "change_pct": None, "source": "Stooq", "source_url": STOOQ_COPPER_URL}

    change_pct = None
    if open_px and close_px:
        change_pct = ((close_px - open_px) / open_px) * 100
    return {"price": close_px, "change_pct": change_pct, "source": "Stooq", "source_url": STOOQ_COPPER_URL}


def _safe_call(func, default: dict):
    try:
        return func()
    except Exception:
        return default
