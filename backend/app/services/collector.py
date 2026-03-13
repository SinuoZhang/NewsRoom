import hashlib
import html
import json
import re
import time
from datetime import datetime, timezone

import feedparser
from dateutil import parser as date_parser
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import News, RawNews, Source


def _safe_parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        dt = date_parser.parse(value)
        if dt.tzinfo is not None:
            return dt.astimezone(timezone.utc).replace(tzinfo=None)
        return dt
    except Exception:
        return None


def _safe_parse_struct_time(value) -> datetime | None:
    if not value:
        return None
    if isinstance(value, time.struct_time):
        return datetime(*value[:6])
    if isinstance(value, tuple) and len(value) >= 6:
        return datetime(*value[:6])
    return None


def _extract_published_at(entry: dict) -> datetime | None:
    for key in ("published", "pubDate", "updated", "created"):
        dt = _safe_parse_datetime(entry.get(key))
        if dt is not None:
            return dt

    for key in ("published_parsed", "updated_parsed", "created_parsed"):
        dt = _safe_parse_struct_time(entry.get(key))
        if dt is not None:
            return dt

    return None


def _to_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8", errors="ignore")).hexdigest()


def _strip_html(value: str) -> str:
    text = value or ""
    text = text.strip()
    text = html.unescape(html.unescape(text))
    text = text.replace("\xa0", " ")
    text = re.sub(r"(?is)<(script|style)[^>]*>.*?</\\1>", " ", text)
    text = re.sub(r"(?i)<br\s*/?>", "\n", text)
    text = re.sub(r"(?i)</p\s*>", "\n", text)
    text = re.sub(r"(?i)<p[^>]*>", "", text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = text.replace("[…]", "").replace("[...]", "")
    lines = [re.sub(r"[ \t]+", " ", ln).strip() for ln in text.splitlines()]
    lines = [ln for ln in lines if ln]
    return "\n".join(lines).strip()


def _extract_content(entry: dict) -> str:
    candidates: list[str] = []
    for key in ("summary", "description", "subtitle"):
        val = entry.get(key)
        if isinstance(val, str) and val.strip():
            candidates.append(val)

    content_blocks = entry.get("content")
    if isinstance(content_blocks, list):
        for block in content_blocks:
            if isinstance(block, dict):
                val = block.get("value")
                if isinstance(val, str) and val.strip():
                    candidates.append(val)

    for text in candidates:
        cleaned = _strip_html(text)
        if cleaned:
            return cleaned[:6000]
    return ""


def collect_from_sources(db: Session, progress_callback=None) -> dict:
    sources = db.query(Source).filter(Source.is_active.is_(True)).all()
    known_hashes = {row[0] for row in db.query(News.url_hash).all()}

    fetched_count = 0
    inserted_count = 0
    duplicate_count = 0

    source_total = len(sources)
    source_done = 0

    for source in sources:
        if progress_callback:
            progress_callback(
                {
                    "source_total": source_total,
                    "source_done": source_done,
                    "current_source": source.name,
                    "fetched_count": fetched_count,
                    "inserted_count": inserted_count,
                    "duplicate_count": duplicate_count,
                }
            )

        feed = feedparser.parse(source.rss_url)
        for entry in feed.entries:
            title = _strip_html(str(entry.get("title") or ""))
            url = (entry.get("link") or "").strip()
            content = _extract_content(entry)
            published_at = _extract_published_at(entry)

            if not title or not url:
                continue

            fetched_count += 1

            try:
                with db.begin_nested():
                    raw_item = RawNews(
                        source_id=source.id,
                        title=title,
                        url=url,
                        published_at=published_at,
                        payload_json=_to_json_safe_payload(dict(entry)),
                    )
                    db.add(raw_item)

                    url_hash = _to_hash(url)
                    if url_hash in known_hashes:
                        duplicate_count += 1
                        continue

                    content_hash = _to_hash(f"{title}-{content}")
                    item = News(
                        source_id=source.id,
                        title=title,
                        url=url,
                        url_hash=url_hash,
                        content=content,
                        content_hash=content_hash,
                        published_at=published_at,
                        collected_at=datetime.utcnow(),
                        impact_score=_estimate_impact_score(title, content),
                    )
                    db.add(item)
                    db.flush()
                    known_hashes.add(url_hash)
                    inserted_count += 1
            except IntegrityError:
                duplicate_count += 1

        source_done += 1
        if progress_callback:
            progress_callback(
                {
                    "source_total": source_total,
                    "source_done": source_done,
                    "current_source": source.name,
                    "fetched_count": fetched_count,
                    "inserted_count": inserted_count,
                    "duplicate_count": duplicate_count,
                }
            )

    db.commit()

    return {
        "source_count": len(sources),
        "fetched_count": fetched_count,
        "inserted_count": inserted_count,
        "duplicate_count": duplicate_count,
    }


def _to_json_safe_payload(payload: dict) -> dict:
    try:
        return json.loads(json.dumps(payload, default=str))
    except Exception:
        return {"raw": str(payload)[:2000]}


def _estimate_impact_score(title: str, content: str) -> float:
    text = f"{title} {content}".lower()
    score = 20.0
    high_impact_terms = ["fed", "war", "election", "inflation", "interest rate", "tariff", "sanction"]
    for term in high_impact_terms:
        if term in text:
            score += 12
    return min(score, 100.0)
