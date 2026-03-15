from collections import Counter
from datetime import datetime, timedelta
import html
import json
import os
from pathlib import Path
import re

import feedparser
from fastapi import APIRouter, Depends, HTTPException, Query
import requests
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from app.core.config import get_settings
from app.db import engine, get_db
from app.models import News, NewsAnalysis, RawNews, Source
from app.schemas import (
    CollectResult,
    DailyOutlook,
    FinanceHeadlineOut,
    LlmChatIn,
    LlmChatOut,
    LlmMemoryAppendIn,
    LlmRefineRerunIn,
    LlmRefineRerunOut,
    LlmSelectNewsIn,
    LlmSelectNewsItemOut,
    LlmSelectNewsOut,
    LlmModelSelectIn,
    LlmModelsOut,
    MarketSnapshotOut,
    NewsOut,
    OwidSeriesOut,
    SourceOut,
    TranslateIn,
    TranslateOut,
)
from app.services.analyzer import analyze_news
from app.services.jobs import get_collect_status, run_collect_job
from app.services.llm_client import chat_with_llm, get_llm_identity, list_llm_models, select_llm_model
from app.services.market_data import get_market_snapshot
from app.services.owid_data import get_owid_series

router = APIRouter()
CHAT_MEMORY_FILE = Path(__file__).resolve().parents[3] / "logs" / "llm_chat_memory.jsonl"


def _clean_text_for_display(value: str | None) -> str:
    if not value:
        return ""
    text = html.unescape(html.unescape(value))
    text = text.replace("\xa0", " ")
    text = re.sub(r"(?is)<(script|style)[^>]*>.*?</\\1>", " ", text)
    text = re.sub(r"(?i)<br\s*/?>", "\n", text)
    text = re.sub(r"(?i)</p\s*>", "\n", text)
    text = re.sub(r"(?i)<p[^>]*>", "", text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = text.replace("[…]", "").replace("[...]", "")
    lines = [re.sub(r"[ \t]+", " ", ln).strip() for ln in text.splitlines()]
    return "\n".join([ln for ln in lines if ln]).strip()


def _region_from_source_name(name: str) -> str:
    text = (name or "").lower()
    if "nytimes" in text or "npr" in text or "cnbc" in text or "wsj" in text:
        return "north_america"
    if (
        "bbc" in text
        or "financial times" in text
        or "guardian" in text
        or "economist" in text
        or "telegraph" in text
        or "independent" in text
        or "reuters" in text
        or "dw " in text
        or "deutsche welle" in text
        or "spiegel" in text
        or "tagesschau" in text
        or "france24" in text
        or "rfi" in text
    ):
        return "europe"
    if "al jazeera" in text:
        return "middle_east"
    if "36kr" in text or "china news" in text or "hkfp" in text or "rthk" in text or "udn" in text:
        return "greater_china"
    if "cna singapore" in text or "star malaysia" in text or "malay mail" in text:
        return "se_asia"
    return "other"


def _source_timezone_from_name(name: str) -> str:
    text = (name or "").lower()
    if (
        "bbc" in text
        or "financial times" in text
        or "guardian" in text
        or "economist" in text
        or "telegraph" in text
        or "independent" in text
        or "reuters" in text
    ):
        return "Europe/London"
    if "dw " in text or "deutsche welle" in text or "spiegel" in text or "tagesschau" in text:
        return "Europe/Berlin"
    if "france24" in text or "rfi" in text:
        return "Europe/Paris"
    if "nytimes" in text or "npr" in text or "cnbc" in text or "wsj" in text:
        return "America/New_York"
    if "al jazeera" in text:
        return "Asia/Qatar"
    if "36kr" in text or "china news" in text:
        return "Asia/Shanghai"
    if "cna singapore" in text:
        return "Asia/Singapore"
    if "star malaysia" in text or "malay mail" in text:
        return "Asia/Kuala_Lumpur"
    if "hkfp" in text or "rthk" in text:
        return "Asia/Hong_Kong"
    if "udn" in text:
        return "Asia/Taipei"
    return "UTC"


def _normalize_lang_code(value: str | None) -> str:
    raw = (value or "").strip().lower()
    if raw.startswith("zh"):
        return "zh"
    if raw.startswith("de"):
        return "de"
    if raw.startswith("en"):
        return "en"
    return ""


def _detect_prompt_language(text: str) -> str:
    if re.search(r"[\u4e00-\u9fff]", text):
        return "zh"
    if re.search(r"[äöüßÄÖÜ]", text):
        return "de"
    german_markers = re.findall(r"\b(der|die|das|und|ist|nicht|mit|fuer|für|von|zu|ein|eine|auf|im|den)\b", text.lower())
    if len(german_markers) >= 2:
        return "de"
    english_markers = re.findall(r"\b(the|and|is|are|with|for|from|to|of|in|on|what|how|why)\b", text.lower())
    if len(english_markers) >= 2:
        return "en"
    return ""


def _resolve_reply_language(message: str, ui_lang: str | None) -> str:
    detected = _detect_prompt_language(message)
    if detected:
        return detected
    fallback = _normalize_lang_code(ui_lang)
    return fallback or "en"


def _reply_language_instruction(reply_lang: str) -> str:
    if reply_lang == "zh":
        return "Reply in Simplified Chinese by default."
    if reply_lang == "de":
        return "Reply in German by default."
    return "Reply in English by default."


def _append_chat_memory(role: str, text: str, provider: str | None = None, model: str | None = None) -> None:
    CHAT_MEMORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    record = {
        "ts": datetime.utcnow().isoformat(),
        "role": role,
        "text": text,
        "provider": provider,
        "model": model,
    }
    with CHAT_MEMORY_FILE.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


def _read_chat_memory(hours: int = 24) -> list[dict]:
    if not CHAT_MEMORY_FILE.exists():
        return []

    cutoff = datetime.utcnow() - timedelta(hours=hours)
    rows: list[dict] = []
    with CHAT_MEMORY_FILE.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                item = json.loads(line)
                ts = datetime.fromisoformat(item.get("ts", ""))
                if ts >= cutoff:
                    rows.append(item)
            except Exception:
                continue
    return rows


def _build_recent_chat_context(hours: int = 24, turns: int = 10, max_chars: int = 6000) -> str:
    rows = _read_chat_memory(hours=hours)
    if not rows:
        return ""

    role_map = {"user": "User", "assistant": "Assistant"}
    items: list[str] = []
    for item in rows:
        role = str(item.get("role", "")).strip().lower()
        if role not in role_map:
            continue
        text = str(item.get("text") or "").strip()
        if not text:
            continue
        compact = re.sub(r"\s+", " ", text)[:600]
        items.append(f"{role_map[role]}: {compact}")

    if not items:
        return ""

    keep = max(1, min(turns, 30)) * 2
    sliced = items[-keep:]
    block = "\n".join(sliced)
    if len(block) > max_chars:
        block = block[-max_chars:]
    return block


def _sqlite_db_file_size_bytes() -> int | None:
    url = str(engine.url)
    if not url.startswith("sqlite:///"):
        return None

    raw_path = url.replace("sqlite:///", "", 1)
    p = Path(raw_path)
    if not p.is_absolute():
        p = Path(os.getcwd()) / p
    if not p.exists():
        return None
    return int(p.stat().st_size)


def _apply_region_filter(query, region: str | None):
    if not region or region == "all":
        return query

    source_name = func.lower(Source.name)
    if region == "north_america":
        clause = or_(
            source_name.like("%nytimes%"),
            source_name.like("%npr%"),
            source_name.like("%cnbc%"),
            source_name.like("%wsj%"),
        )
    elif region == "europe":
        clause = or_(
            source_name.like("%bbc%"),
            source_name.like("%financial times%"),
            source_name.like("%guardian%"),
            source_name.like("%economist%"),
            source_name.like("%telegraph%"),
            source_name.like("%independent%"),
            source_name.like("%reuters%"),
            source_name.like("%dw %"),
            source_name.like("%deutsche welle%"),
            source_name.like("%spiegel%"),
            source_name.like("%tagesschau%"),
            source_name.like("%france24%"),
            source_name.like("%rfi%"),
        )
    elif region == "middle_east":
        clause = source_name.like("%al jazeera%")
    elif region == "greater_china":
        clause = or_(
            source_name.like("%36kr%"),
            source_name.like("%china news%"),
            source_name.like("%hkfp%"),
            source_name.like("%rthk%"),
            source_name.like("%udn%"),
        )
    elif region == "se_asia":
        clause = or_(
            source_name.like("%cna singapore%"),
            source_name.like("%star malaysia%"),
            source_name.like("%malay mail%"),
        )
    else:
        return query

    return query.join(Source, News.source_id == Source.id).filter(clause)

DEFAULT_SOURCES = [
    {
        "name": "BBC World",
        "rss_url": "https://feeds.bbci.co.uk/news/world/rss.xml",
        "category": "world",
    },
    {
        "name": "BBC Politics",
        "rss_url": "https://feeds.bbci.co.uk/news/politics/rss.xml",
        "category": "regional_politics",
    },
    {
        "name": "NYTimes World",
        "rss_url": "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",
        "category": "world",
    },
    {
        "name": "NYTimes Politics",
        "rss_url": "https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml",
        "category": "world_politics",
    },
    {
        "name": "NPR World",
        "rss_url": "https://feeds.npr.org/1004/rss.xml",
        "category": "world",
    },
    {
        "name": "NPR Politics",
        "rss_url": "https://feeds.npr.org/1014/rss.xml",
        "category": "regional_politics",
    },
    {
        "name": "Al Jazeera",
        "rss_url": "https://www.aljazeera.com/xml/rss/all.xml",
        "category": "world_politics",
    },
    {
        "name": "Financial Times World",
        "rss_url": "https://www.ft.com/world?format=rss",
        "category": "world_politics",
    },
    {
        "name": "FT Global Economy",
        "rss_url": "https://www.ft.com/global-economy?format=rss",
        "category": "economy",
    },
    {
        "name": "The Guardian World",
        "rss_url": "https://www.theguardian.com/world/rss",
        "category": "world_politics",
    },
    {
        "name": "The Guardian Business",
        "rss_url": "https://www.theguardian.com/uk/business/rss",
        "category": "economy",
    },
    {
        "name": "The Telegraph News",
        "rss_url": "https://www.telegraph.co.uk/news/rss.xml",
        "category": "regional_politics",
    },
    {
        "name": "The Independent World",
        "rss_url": "https://www.independent.co.uk/news/world/rss",
        "category": "world",
    },
    {
        "name": "DW English Top",
        "rss_url": "https://rss.dw.com/rdf/rss-en-top",
        "category": "world",
    },
    {
        "name": "DW Deutsch Top",
        "rss_url": "https://rss.dw.com/rdf/rss-de-top",
        "category": "regional_politics",
    },
    {
        "name": "DW Chinese",
        "rss_url": "https://rss.dw.com/rdf/rss-chi-all",
        "category": "world",
    },
    {
        "name": "SPIEGEL International",
        "rss_url": "https://www.spiegel.de/international/index.rss",
        "category": "world_politics",
    },
    {
        "name": "Tagesschau",
        "rss_url": "https://www.tagesschau.de/xml/rss2",
        "category": "regional_politics",
    },
    {
        "name": "France24 English",
        "rss_url": "https://www.france24.com/en/rss",
        "category": "world",
    },
    {
        "name": "France24 Europe",
        "rss_url": "https://www.france24.com/en/europe/rss",
        "category": "world_politics",
    },
    {
        "name": "RFI English",
        "rss_url": "https://www.rfi.fr/en/rss",
        "category": "world",
    },
    {
        "name": "BBC Chinese",
        "rss_url": "https://feeds.bbci.co.uk/zhongwen/simp/rss.xml",
        "category": "world",
    },
    {
        "name": "CNBC Finance",
        "rss_url": "https://www.cnbc.com/id/10000664/device/rss/rss.html",
        "category": "finance",
    },
    {
        "name": "36Kr",
        "rss_url": "https://www.36kr.com/feed",
        "category": "technology",
    },
    {
        "name": "CNA Singapore World",
        "rss_url": "https://www.channelnewsasia.com/rssfeeds/8395954",
        "category": "regional_politics",
    },
    {
        "name": "CNA Singapore Top",
        "rss_url": "https://www.channelnewsasia.com/rssfeeds/8395986",
        "category": "world",
    },
    {
        "name": "The Star Malaysia Nation",
        "rss_url": "https://www.thestar.com.my/rss/news/nation",
        "category": "regional_politics",
    },
    {
        "name": "Malay Mail",
        "rss_url": "https://www.malaymail.com/feed/rss",
        "category": "economy",
    },
    {
        "name": "HKFP",
        "rss_url": "https://hongkongfp.com/feed/",
        "category": "regional_politics",
    },
    {
        "name": "UDN Global",
        "rss_url": "https://udn.com/rssfeed/news/2/6638?ch=news",
        "category": "world_politics",
    },
]


@router.get("/health")
def health_check():
    return {"status": "ok", "time": datetime.utcnow().isoformat()}


@router.post("/translate", response_model=TranslateOut)
def translate_text(payload: TranslateIn):
    text = (payload.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")

    if len(text) > 6000:
        raise HTTPException(status_code=400, detail="text too long, max 6000 chars")

    def _normalize_lang(code: str | None, for_mymemory: bool = False) -> str:
        value = (code or "").strip().lower()
        if not value:
            return "en"
        if value.startswith("zh"):
            return "zh-CN" if for_mymemory else "zh"
        if value.startswith("de"):
            return "de"
        if value.startswith("en"):
            return "en"
        return value

    def _guess_source_lang(input_text: str) -> str:
        if re.search(r"[\u4e00-\u9fff]", input_text):
            return "zh"
        if re.search(r"[äöüßÄÖÜ]", input_text):
            return "de"
        return "en"

    settings = get_settings()
    configured_url = (getattr(settings, "translate_api_url", "") or "").strip()
    libre_urls = [
        url
        for url in [
            configured_url,
            "https://translate.argosopentech.com/translate",
            "https://libretranslate.com/translate",
        ]
        if url
    ]

    source_lang = (payload.source_lang or "auto").strip().lower()
    target_lang = _normalize_lang(payload.target_lang, for_mymemory=False)
    libre_source = "auto" if source_lang == "auto" else _normalize_lang(source_lang, for_mymemory=False)

    libre_errors: list[str] = []
    for api_url in libre_urls:
        try:
            body = {
                "q": text,
                "source": libre_source,
                "target": target_lang,
                "format": "text",
            }
            res = requests.post(api_url, json=body, timeout=20)
            if res.status_code >= 400:
                libre_errors.append(f"{api_url} HTTP {res.status_code}")
                continue
            data = res.json() if res.content else {}
            translated = str(data.get("translatedText") or "").strip()
            if not translated:
                libre_errors.append(f"{api_url} empty translatedText")
                continue
            detected = str(data.get("detectedLanguage") or source_lang or "auto")
            return TranslateOut(
                translated_text=translated,
                source_lang=detected,
                target_lang=target_lang,
                provider=f"libretranslate:{api_url}",
            )
        except Exception as exc:
            libre_errors.append(f"{api_url} {type(exc).__name__}: {exc}")

    try:
        mm_source = _normalize_lang(source_lang if source_lang != "auto" else _guess_source_lang(text), for_mymemory=True)
        mm_target = _normalize_lang(target_lang, for_mymemory=True)
        mm_url = "https://api.mymemory.translated.net/get"
        params = {"q": text, "langpair": f"{mm_source}|{mm_target}"}
        res = requests.get(mm_url, params=params, timeout=20)
        if res.status_code >= 400:
            raise RuntimeError(f"HTTP {res.status_code}")
        data = res.json() if res.content else {}
        translated = str((data.get("responseData") or {}).get("translatedText") or "").strip()
        if not translated:
            raise RuntimeError("empty translatedText")

        return TranslateOut(
            translated_text=translated,
            source_lang=mm_source,
            target_lang=mm_target,
            provider="mymemory",
        )
    except Exception as exc:
        all_errors = libre_errors + [f"mymemory {type(exc).__name__}: {exc}"]
        raise HTTPException(status_code=502, detail=f"translate api error: {' | '.join(all_errors)[:1500]}") from exc


@router.post("/sources/seed")
def seed_sources(db: Session = Depends(get_db)):
    return sync_sources(db)


def sync_sources(db: Session) -> dict:
    inserted = 0
    updated = 0
    skipped_invalid = 0
    active_urls: set[str] = set()

    for src in DEFAULT_SOURCES:
        if not _feed_has_entries(src["rss_url"]):
            skipped_invalid += 1
            continue

        active_urls.add(src["rss_url"])
        exists = db.query(Source).filter(Source.name == src["name"]).first()
        if not exists:
            exists = db.query(Source).filter(Source.rss_url == src["rss_url"]).first()

        if exists:
            exists.name = src["name"]
            exists.rss_url = src["rss_url"]
            exists.category = src["category"]
            exists.is_active = True
            updated += 1
            continue

        db.add(Source(**src, is_active=True))
        inserted += 1

    db.flush()

    to_remove = db.query(Source).filter(~Source.rss_url.in_(active_urls)).all() if active_urls else db.query(Source).all()
    removed = _delete_sources(db, to_remove)

    db.commit()
    return {
        "inserted": inserted,
        "updated": updated,
        "removed": removed,
        "skipped_invalid": skipped_invalid,
        "active": len(active_urls),
    }


def _feed_has_entries(url: str) -> bool:
    try:
        parsed = feedparser.parse(url)
        status = getattr(parsed, "status", None)
        return len(parsed.entries) > 0 and status in {None, 200, 301, 302}
    except Exception:
        return False


def _delete_sources(db: Session, sources: list[Source]) -> int:
    if not sources:
        return 0

    ids = [x.id for x in sources]
    analysis_ids = [x[0] for x in db.query(NewsAnalysis.id).join(News, News.id == NewsAnalysis.news_id).filter(News.source_id.in_(ids)).all()]
    if analysis_ids:
        db.query(NewsAnalysis).filter(NewsAnalysis.id.in_(analysis_ids)).delete(synchronize_session=False)

    db.query(News).filter(News.source_id.in_(ids)).delete(synchronize_session=False)
    from app.models import RawNews

    db.query(RawNews).filter(RawNews.source_id.in_(ids)).delete(synchronize_session=False)
    db.query(Source).filter(Source.id.in_(ids)).delete(synchronize_session=False)
    return len(ids)


@router.get("/sources", response_model=list[SourceOut])
def list_sources(db: Session = Depends(get_db)):
    return db.query(Source).order_by(Source.id.desc()).all()


@router.post("/collect/run", response_model=CollectResult)
def run_collect():
    return run_collect_job(reason="manual")


@router.get("/collect/status")
def collect_status():
    return get_collect_status()


@router.get("/market/snapshot", response_model=MarketSnapshotOut)
def market_snapshot():
    return get_market_snapshot()


@router.get("/market/finance-news", response_model=list[FinanceHeadlineOut])
def market_finance_news(limit: int = Query(default=8, ge=1, le=20), db: Session = Depends(get_db)):
    rows = (
        db.query(News)
        .join(Source, News.source_id == Source.id)
        .filter(Source.category.in_(["finance", "economy"]))
        .order_by(func.coalesce(News.published_at, News.collected_at).desc(), News.id.desc())
        .limit(limit)
        .all()
    )
    return [
        FinanceHeadlineOut(
            id=row.id,
            source_name=row.source.name,
            title=_clean_text_for_display(row.title),
            url=row.url,
            published_at=row.published_at,
        )
        for row in rows
    ]


@router.get("/owid/series", response_model=OwidSeriesOut)
def owid_series(
    indicator: str = Query(..., min_length=1, description="OWID indicator slug, e.g. co2-per-capita"),
    entity: str | None = Query(default=None, description="Filter by entity name, e.g. Germany"),
    limit: int = Query(default=240, ge=1, le=5000),
):
    try:
        return get_owid_series(indicator=indicator, entity=entity, limit=limit)
    except requests.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"OWID upstream error: {exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"OWID query failed: {exc}") from exc


@router.post("/llm/chat", response_model=LlmChatOut)
def llm_chat(payload: LlmChatIn, db: Session = Depends(get_db)):
    reply_lang = _resolve_reply_language(payload.message, payload.ui_lang)
    lang_instruction = _reply_language_instruction(reply_lang)
    history_context = ""
    if payload.use_chat_history:
        history_context = _build_recent_chat_context(hours=24, turns=payload.history_turns, max_chars=6000)

    if not payload.use_news_context:
        general_system = f"You are a helpful assistant. Answer clearly and concisely. {lang_instruction}"
        if history_context:
            prompt = (
                "Recent conversation context (for follow-up continuity):\n"
                f"{history_context}\n\n"
                f"Current user request:\n{payload.message}"
            )
        else:
            prompt = payload.message
        answer = chat_with_llm(general_system, prompt)
        provider, model = get_llm_identity()
        _append_chat_memory("user", payload.message, provider=provider, model=model)
        _append_chat_memory("assistant", answer.strip(), provider=provider, model=model)
        return LlmChatOut(answer=answer.strip(), provider=provider, model=model, used_news_count=0)

    query = db.query(News)

    if payload.mode == "selected" and payload.news_ids:
        query = query.filter(News.id.in_(payload.news_ids))
    else:
        if payload.source_id is not None:
            query = query.filter(News.source_id == payload.source_id)
        query = _apply_region_filter(query, payload.region)
        if payload.mode == "filtered" and payload.q:
            query = query.filter(News.title.ilike(f"%{payload.q}%"))

    limit = min(max(payload.limit, 1), 80)
    rows = query.order_by(func.coalesce(News.published_at, News.collected_at).desc(), News.id.desc()).limit(limit).all()

    used_count = len(rows)
    large_mode = used_count > 20 or (payload.mode == "all" and used_count > 12)

    if large_mode:
        answer = _bulk_llm_analysis(payload.message, rows, lang_instruction, history_context)
    else:
        context_lines = []
        total_chars = 0
        max_context_chars = 120000
        used_count = 0

        for item in rows:
            time_text = item.published_at.isoformat() if item.published_at else item.collected_at.isoformat()
            full_content = (item.content or "").strip()
            block = f"[{item.id}] {item.source.name} | {time_text} | {item.title}\n{full_content}"
            if context_lines and total_chars + len(block) > max_context_chars:
                break
            context_lines.append(block)
            total_chars += len(block)
            used_count += 1

        system_prompt = (
            "You are a geopolitical and macroeconomic analyst. "
            "Answer using the provided news context only. "
            "If evidence is insufficient, say what is missing. "
            f"{lang_instruction}"
        )
        user_prompt = (
            (f"Recent conversation context (for follow-up continuity):\n{history_context}\n\n" if history_context else "")
            + f"User request:\n{payload.message}\n\n"
            "News context:\n"
            + "\n\n".join(context_lines)
        )
        answer = chat_with_llm(system_prompt, user_prompt)

    provider, model = get_llm_identity()
    _append_chat_memory("user", payload.message, provider=provider, model=model)
    _append_chat_memory("assistant", answer.strip(), provider=provider, model=model)
    return LlmChatOut(answer=answer.strip(), provider=provider, model=model, used_news_count=used_count)


def _bulk_llm_analysis(user_message: str, rows: list[News], lang_instruction: str, history_context: str = "") -> str:
    chunks: list[list[str]] = []
    current: list[str] = []
    current_chars = 0
    max_chars_per_chunk = 45000

    for item in rows:
        time_text = item.published_at.isoformat() if item.published_at else item.collected_at.isoformat()
        block = f"[{item.id}] {item.source.name} | {time_text} | {item.title}\n{(item.content or '').strip()}"
        if current and current_chars + len(block) > max_chars_per_chunk:
            chunks.append(current)
            current = []
            current_chars = 0
        current.append(block)
        current_chars += len(block)

    if current:
        chunks.append(current)

    chunks = chunks[:5]
    partial_summaries: list[str] = []
    for idx, chunk in enumerate(chunks, start=1):
        system_prompt = (
            "You are an analyst. Summarize this chunk of news with: "
            "(1) key events, (2) causal links, (3) market/policy implications, (4) uncertainty. "
            f"{lang_instruction}"
        )
        user_prompt = (
            f"Chunk {idx}/{len(chunks)}\n"
            + (f"Recent conversation context:\n{history_context}\n\n" if history_context else "")
            + f"User goal: {user_message}\n\n"
            "News chunk:\n"
            + "\n\n".join(chunk)
        )
        partial = chat_with_llm(system_prompt, user_prompt)
        partial_summaries.append(f"[chunk-{idx}]\n{partial}")

    final_system = (
        "You are a senior strategist. Merge chunk analyses into one coherent report. "
        "Output: overview, cross-news linkages, key risks, key opportunities, and what to monitor next. "
        f"{lang_instruction}"
    )
    final_user = (
        (f"Recent conversation context:\n{history_context}\n\n" if history_context else "")
        + f"User goal: {user_message}\n\n"
        "Chunk analyses:\n"
        + "\n\n".join(partial_summaries)
    )
    return chat_with_llm(final_system, final_user)


def _extract_llm_selected_ids(raw_text: str, allowed_ids: set[int]) -> tuple[list[int], str]:
    selected: list[int] = []
    reason = ""
    text = raw_text.strip()

    try:
        payload = json.loads(text)
    except Exception:
        match = re.search(r"\{[\s\S]*\}", text)
        payload = None
        if match:
            try:
                payload = json.loads(match.group(0))
            except Exception:
                payload = None

    if isinstance(payload, dict):
        ids = payload.get("selected_ids") or []
        reason = str(payload.get("reason") or "").strip()[:600]
        if isinstance(ids, list):
            for x in ids:
                try:
                    value = int(x)
                except Exception:
                    continue
                if value in allowed_ids and value not in selected:
                    selected.append(value)

    if selected:
        return selected, reason

    fallback_ids = []
    for token in re.findall(r"\b\d+\b", text):
        value = int(token)
        if value in allowed_ids and value not in fallback_ids:
            fallback_ids.append(value)
    return fallback_ids, reason


def _extract_refine_plan(user_message: str, previous_answer: str) -> tuple[list[str], list[str]]:
    system_prompt = (
        "You are a precise research planner. "
        "Based on the user request and previous answer, identify missing information and search keywords. "
        "Return strict JSON: {\"missing_points\":[string,...],\"keywords\":[string,...]}."
    )
    user_prompt = (
        f"User request:\n{user_message}\n\n"
        f"Previous answer:\n{previous_answer}\n"
    )
    raw = chat_with_llm(system_prompt, user_prompt)

    def _fallback_keywords(text: str) -> list[str]:
        zh_tokens = re.findall(r"[\u4e00-\u9fff]{2,8}", text)
        en_tokens = re.findall(r"\b[a-zA-Z][a-zA-Z\-]{3,20}\b", text)
        merged: list[str] = []
        for token in zh_tokens + en_tokens:
            value = token.strip()
            if not value:
                continue
            low = value.lower()
            if low in {"that", "this", "with", "from", "have", "been", "were", "will"}:
                continue
            if value not in merged:
                merged.append(value)
            if len(merged) >= 8:
                break
        return merged

    try:
        payload = json.loads(raw)
    except Exception:
        payload = None
        match = re.search(r"\{[\s\S]*\}", raw)
        if match:
            try:
                payload = json.loads(match.group(0))
            except Exception:
                payload = None

    if isinstance(payload, dict):
        missing = [str(x).strip() for x in (payload.get("missing_points") or []) if str(x).strip()]
        keywords = [str(x).strip() for x in (payload.get("keywords") or []) if str(x).strip()]
        if keywords:
            return missing[:8], keywords[:10]

    return [], _fallback_keywords(f"{user_message}\n{previous_answer}")


@router.post("/llm/select-news", response_model=LlmSelectNewsOut)
def llm_select_news(payload: LlmSelectNewsIn, db: Session = Depends(get_db)):
    instruction = (payload.instruction or "").strip()
    if not instruction:
        raise HTTPException(status_code=400, detail="instruction is required")

    query = db.query(News)
    if payload.mode == "selected" and payload.news_ids:
        query = query.filter(News.id.in_(payload.news_ids))
    else:
        if payload.source_id is not None:
            query = query.filter(News.source_id == payload.source_id)
        query = _apply_region_filter(query, payload.region)
        if payload.mode == "filtered" and payload.q:
            query = query.filter(News.title.ilike(f"%{payload.q}%"))

    unlimited_mode = payload.limit <= 0
    ordered_query = query.order_by(func.coalesce(News.published_at, News.collected_at).desc(), News.id.desc())
    if unlimited_mode:
        rows = ordered_query.all()
    else:
        limit = min(max(payload.limit, 1), 500)
        rows = ordered_query.limit(limit).all()
    if not rows:
        provider, model = get_llm_identity()
        return LlmSelectNewsOut(
            selected_ids=[],
            selected_items=[],
            provider=provider,
            model=model,
            scanned_news_count=0,
            reason="No news available under current filters.",
        )

    provider, model = get_llm_identity()
    selected_ids: list[int] = []
    selected_id_set: set[int] = set()
    chunk: list[str] = []
    chunk_allowed: set[int] = set()
    chunk_chars = 0
    max_chars = 42000
    max_chunks = 999999 if unlimited_mode else 8
    chunks_done = 0
    reason_parts: list[str] = []

    def run_chunk(lines: list[str], allowed: set[int]) -> tuple[list[int], str]:
        system_prompt = (
            "You are a precise news selector. Select only IDs that match the user instruction. "
            "Do not hallucinate IDs; only choose from given IDs. "
            "Return strict JSON: {\"selected_ids\":[int,...],\"reason\":\"short reason\"}."
        )
        user_prompt = (
            f"User instruction:\n{instruction}\n\n"
            "Candidate news list:\n"
            + "\n\n".join(lines)
        )
        raw = chat_with_llm(system_prompt, user_prompt)
        return _extract_llm_selected_ids(raw, allowed)

    for item in rows:
        source_name = item.source.name if item.source else "unknown"
        excerpt = (item.content or "").replace("\n", " ").strip()[:180]
        line = f"[{item.id}] {source_name} | {item.title}\n{excerpt}"
        if chunk and chunk_chars + len(line) > max_chars:
            ids, reason = run_chunk(chunk, chunk_allowed)
            for value in ids:
                if value not in selected_id_set:
                    selected_id_set.add(value)
                    selected_ids.append(value)
            if reason:
                reason_parts.append(reason)
            chunks_done += 1
            if chunks_done >= max_chunks:
                break
            chunk = []
            chunk_allowed = set()
            chunk_chars = 0

        chunk.append(line)
        chunk_allowed.add(item.id)
        chunk_chars += len(line)

    if chunk and chunks_done < max_chunks:
        ids, reason = run_chunk(chunk, chunk_allowed)
        for value in ids:
            if value not in selected_id_set:
                selected_id_set.add(value)
                selected_ids.append(value)
        if reason:
            reason_parts.append(reason)

    item_map = {x.id: x for x in rows}
    selected_items: list[LlmSelectNewsItemOut] = []
    for news_id in selected_ids:
        row = item_map.get(news_id)
        if not row:
            continue
        selected_items.append(
            LlmSelectNewsItemOut(
                id=row.id,
                title=_clean_text_for_display(row.title),
                source=row.source.name if row.source else "unknown",
                url=row.url,
                published_at=row.published_at,
            )
        )

    reason_text = " | ".join([x for x in reason_parts if x]).strip()
    if not reason_text:
        reason_text = "Selection completed."

    return LlmSelectNewsOut(
        selected_ids=selected_ids,
        selected_items=selected_items,
        provider=provider,
        model=model,
        scanned_news_count=len(rows),
        reason=reason_text[:1000],
    )


@router.post("/llm/refine-rerun", response_model=LlmRefineRerunOut)
def llm_refine_rerun(payload: LlmRefineRerunIn, db: Session = Depends(get_db)):
    message = (payload.message or "").strip()
    previous_answer = (payload.previous_answer or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="message is required")
    if not previous_answer:
        raise HTTPException(status_code=400, detail="previous_answer is required")

    missing_points, keywords = _extract_refine_plan(message, previous_answer)

    query = db.query(News)
    if payload.source_id is not None:
        query = query.filter(News.source_id == payload.source_id)
    query = _apply_region_filter(query, payload.region)

    if payload.mode == "filtered" and payload.q:
        query = query.filter(News.title.ilike(f"%{payload.q}%"))

    if keywords:
        clauses = []
        for kw in keywords[:10]:
            clauses.append(News.title.ilike(f"%{kw}%"))
            clauses.append(News.content.ilike(f"%{kw}%"))
        query = query.filter(or_(*clauses))

    candidates = query.order_by(func.coalesce(News.published_at, News.collected_at).desc(), News.id.desc()).limit(240).all()

    existing_ids = set(payload.news_ids or [])
    seen_title: set[str] = set()
    added_ids: list[int] = []
    merged_ids: list[int] = list(payload.news_ids or [])
    max_add = max(6, min(payload.limit, 24))
    for item in candidates:
        if item.id in existing_ids:
            continue
        title_key = re.sub(r"\s+", " ", (item.title or "").strip().lower())
        if not title_key or title_key in seen_title:
            continue
        seen_title.add(title_key)
        content_len = len((item.content or "").strip())
        if content_len < 80 and len((item.title or "").strip()) < 20:
            continue
        added_ids.append(item.id)
        merged_ids.append(item.id)
        if len(added_ids) >= max_add:
            break

    if not merged_ids:
        merged_ids = [x.id for x in candidates[: max(1, min(payload.limit, 12))]]

    chat_payload = LlmChatIn(
        message=message,
        mode="selected",
        use_news_context=True,
        ui_lang=payload.ui_lang,
        use_chat_history=payload.use_chat_history,
        history_turns=payload.history_turns,
        news_ids=merged_ids,
        limit=min(max(payload.limit, 1), 80),
    )
    chat_result = llm_chat(chat_payload, db)

    selected_rows = (
        db.query(News)
        .filter(News.id.in_(merged_ids))
        .order_by(func.coalesce(News.published_at, News.collected_at).desc(), News.id.desc())
        .all()
    )
    selected_items: list[LlmSelectNewsItemOut] = []
    for row in selected_rows:
        selected_items.append(
            LlmSelectNewsItemOut(
                id=row.id,
                title=_clean_text_for_display(row.title),
                source=row.source.name if row.source else "unknown",
                url=row.url,
                published_at=row.published_at,
            )
        )

    return LlmRefineRerunOut(
        answer=chat_result.answer,
        provider=chat_result.provider,
        model=chat_result.model,
        used_news_count=chat_result.used_news_count,
        selected_ids=merged_ids,
        added_ids=added_ids,
        selected_items=selected_items,
        keywords=keywords[:10],
        missing_points=missing_points[:8],
    )


@router.get("/llm/models", response_model=LlmModelsOut)
def llm_models():
    return list_llm_models()


@router.post("/llm/models/select", response_model=LlmModelsOut)
def llm_select_model(payload: LlmModelSelectIn):
    try:
        return select_llm_model(payload.model)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/llm/memory")
def llm_memory(hours: int = Query(default=24, ge=1, le=168)):
    return {"items": _read_chat_memory(hours=hours)}


@router.delete("/llm/memory")
def llm_memory_clear():
    if CHAT_MEMORY_FILE.exists():
        CHAT_MEMORY_FILE.unlink(missing_ok=True)
    return {"cleared": True}


@router.post("/llm/memory/append")
def llm_memory_append(payload: LlmMemoryAppendIn):
    role = payload.role.strip().lower()
    if role not in {"user", "assistant", "system"}:
        raise HTTPException(status_code=400, detail="role must be user/assistant/system")
    _append_chat_memory(role, payload.text)
    return {"ok": True}


@router.get("/news", response_model=list[NewsOut])
def list_news(
    q: str | None = Query(default=None),
    source_id: int | None = Query(default=None),
    region: str | None = Query(default=None),
    after_id: int | None = Query(default=None, ge=1),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    query = (
        db.query(News)
        .options(joinedload(News.source), joinedload(News.analysis))
        .order_by(func.coalesce(News.published_at, News.collected_at).desc(), News.id.desc())
    )
    if source_id is not None:
        query = query.filter(News.source_id == source_id)
    query = _apply_region_filter(query, region)
    if q:
        query = query.filter(News.title.ilike(f"%{q}%"))
    if after_id is not None:
        query = query.filter(News.id > after_id)

    rows = query.limit(limit).all()
    output: list[NewsOut] = []
    for row in rows:
        output.append(
            NewsOut(
                id=row.id,
                source_id=row.source_id,
                source_name=row.source.name,
                source_timezone=_source_timezone_from_name(row.source.name),
                title=_clean_text_for_display(row.title),
                url=row.url,
                content=_clean_text_for_display(row.content),
                published_at=row.published_at,
                collected_at=row.collected_at,
                impact_score=row.impact_score,
                topic=row.topic,
                sentiment=row.sentiment,
                analysis=row.analysis,
            )
        )
    return output


@router.get("/news/by-ids", response_model=list[NewsOut])
def list_news_by_ids(ids: list[int] = Query(default=[]), db: Session = Depends(get_db)):
    if not ids:
        return []

    rows = (
        db.query(News)
        .options(joinedload(News.source), joinedload(News.analysis))
        .filter(News.id.in_(ids))
        .all()
    )
    by_id = {row.id: row for row in rows}
    output: list[NewsOut] = []
    for news_id in ids:
        row = by_id.get(news_id)
        if not row:
            continue
        output.append(
            NewsOut(
                id=row.id,
                source_id=row.source_id,
                source_name=row.source.name,
                source_timezone=_source_timezone_from_name(row.source.name),
                title=_clean_text_for_display(row.title),
                url=row.url,
                content=_clean_text_for_display(row.content),
                published_at=row.published_at,
                collected_at=row.collected_at,
                impact_score=row.impact_score,
                topic=row.topic,
                sentiment=row.sentiment,
                analysis=row.analysis,
            )
        )
    return output


@router.get("/news/count")
def count_news(
    q: str | None = Query(default=None),
    source_id: int | None = Query(default=None),
    region: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    query = db.query(News)
    if source_id is not None:
        query = query.filter(News.source_id == source_id)
    query = _apply_region_filter(query, region)
    if q:
        query = query.filter(News.title.ilike(f"%{q}%"))
    return {"total": query.count()}


@router.get("/news/region-counts")
def region_counts(db: Session = Depends(get_db)):
    rows = (
        db.query(Source.name, func.count(News.id))
        .join(News, News.source_id == Source.id)
        .group_by(Source.name)
        .all()
    )
    counts = {
        "north_america": 0,
        "europe": 0,
        "middle_east": 0,
        "greater_china": 0,
        "se_asia": 0,
        "other": 0,
        "all": 0,
    }

    for source_name, count in rows:
        value = int(count)
        region = _region_from_source_name(source_name)
        counts[region] += value
        counts["all"] += value

    return counts


@router.get("/storage/stats")
def storage_stats(db: Session = Depends(get_db)):
    return {
        "db_file_size_bytes": _sqlite_db_file_size_bytes(),
        "news_rows": int(db.query(func.count(News.id)).scalar() or 0),
        "raw_rows": int(db.query(func.count(RawNews.id)).scalar() or 0),
        "analysis_rows": int(db.query(func.count(NewsAnalysis.id)).scalar() or 0),
        "news_content_bytes": int(db.query(func.coalesce(func.sum(func.length(News.content)), 0)).scalar() or 0),
    }


@router.get("/news/{news_id}", response_model=NewsOut)
def get_news(news_id: int, db: Session = Depends(get_db)):
    row = (
        db.query(News)
        .options(joinedload(News.source), joinedload(News.analysis))
        .filter(News.id == news_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="news not found")
    return NewsOut(
        id=row.id,
        source_id=row.source_id,
        source_name=row.source.name,
        source_timezone=_source_timezone_from_name(row.source.name),
        title=_clean_text_for_display(row.title),
        url=row.url,
        content=_clean_text_for_display(row.content),
        published_at=row.published_at,
        collected_at=row.collected_at,
        impact_score=row.impact_score,
        topic=row.topic,
        sentiment=row.sentiment,
        analysis=row.analysis,
    )


@router.post("/analyze/{news_id}")
def run_analysis(news_id: int, db: Session = Depends(get_db)):
    news = db.query(News).filter(News.id == news_id).first()
    if not news:
        raise HTTPException(status_code=404, detail="news not found")
    result = analyze_news(db, news_id)
    return {"news_id": news_id, "analysis_id": result.id, "model": result.model}


@router.get("/daily-outlook", response_model=DailyOutlook)
def get_daily_outlook(db: Session = Depends(get_db)):
    since = datetime.utcnow() - timedelta(hours=24)
    rows = (
        db.query(NewsAnalysis)
        .join(News, News.id == NewsAnalysis.news_id)
        .filter(News.collected_at >= since)
        .all()
    )

    topic_counter = Counter()
    sentiment_counter = Counter()
    highlights = []

    for item in rows:
        topic_counter[item.topic] += 1
        sentiment_counter[item.sentiment] += 1
        if item.short_term_outlook and len(highlights) < 5:
            highlights.append(item.short_term_outlook)

    return DailyOutlook(
        generated_at=datetime.utcnow(),
        coverage_count=len(rows),
        topics=dict(topic_counter),
        sentiment=dict(sentiment_counter),
        highlights=highlights,
    )
