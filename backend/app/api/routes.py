from collections import Counter
from datetime import datetime, timedelta
import html
import json
import os
from pathlib import Path
import re

import feedparser
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from app.db import engine, get_db
from app.models import News, NewsAnalysis, RawNews, Source
from app.schemas import (
    CollectResult,
    DailyOutlook,
    FinanceHeadlineOut,
    LlmChatIn,
    LlmChatOut,
    LlmMemoryAppendIn,
    LlmModelSelectIn,
    LlmModelsOut,
    MarketSnapshotOut,
    NewsOut,
    SourceOut,
)
from app.services.analyzer import analyze_news
from app.services.jobs import get_collect_status, run_collect_job
from app.services.llm_client import chat_with_llm, get_llm_identity, list_llm_models, select_llm_model
from app.services.market_data import get_market_snapshot

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
    if "bbc" in text or "financial times" in text:
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
    if "bbc" in text or "financial times" in text:
        return "Europe/London"
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
        clause = or_(source_name.like("%bbc%"), source_name.like("%financial times%"))
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
        "name": "CNBC Finance",
        "rss_url": "https://www.cnbc.com/id/10000664/device/rss/rss.html",
        "category": "finance",
    },
    {
        "name": "36Kr",
        "rss_url": "https://36kr.com/feed",
        "category": "technology",
    },
    {
        "name": "China News World",
        "rss_url": "https://www.chinanews.com.cn/rss/world.xml",
        "category": "world_politics",
    },
    {
        "name": "China News Finance",
        "rss_url": "https://www.chinanews.com.cn/rss/finance.xml",
        "category": "finance",
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
        "name": "RTHK World",
        "rss_url": "https://rthk.hk/rthk/news/rss/c_expressnews_cinternational.xml",
        "category": "world_politics",
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


@router.post("/llm/chat", response_model=LlmChatOut)
def llm_chat(payload: LlmChatIn, db: Session = Depends(get_db)):
    if not payload.use_news_context:
        general_system = "You are a helpful assistant. Answer clearly and concisely."
        answer = chat_with_llm(general_system, payload.message)
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
        answer = _bulk_llm_analysis(payload.message, rows)
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
            "If evidence is insufficient, say what is missing."
        )
        user_prompt = (
            f"User request:\n{payload.message}\n\n"
            "News context:\n"
            + "\n\n".join(context_lines)
        )
        answer = chat_with_llm(system_prompt, user_prompt)

    provider, model = get_llm_identity()
    _append_chat_memory("user", payload.message, provider=provider, model=model)
    _append_chat_memory("assistant", answer.strip(), provider=provider, model=model)
    return LlmChatOut(answer=answer.strip(), provider=provider, model=model, used_news_count=used_count)


def _bulk_llm_analysis(user_message: str, rows: list[News]) -> str:
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
            "(1) key events, (2) causal links, (3) market/policy implications, (4) uncertainty."
        )
        user_prompt = (
            f"Chunk {idx}/{len(chunks)}\n"
            f"User goal: {user_message}\n\n"
            "News chunk:\n"
            + "\n\n".join(chunk)
        )
        partial = chat_with_llm(system_prompt, user_prompt)
        partial_summaries.append(f"[chunk-{idx}]\n{partial}")

    final_system = (
        "You are a senior strategist. Merge chunk analyses into one coherent report. "
        "Output: overview, cross-news linkages, key risks, key opportunities, and what to monitor next."
    )
    final_user = (
        f"User goal: {user_message}\n\n"
        "Chunk analyses:\n"
        + "\n\n".join(partial_summaries)
    )
    return chat_with_llm(final_system, final_user)


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
