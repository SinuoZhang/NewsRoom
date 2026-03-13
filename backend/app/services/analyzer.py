import json
import re

import requests
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import News, NewsAnalysis

settings = get_settings()


def analyze_news(db: Session, news_id: int) -> NewsAnalysis:
    news = db.query(News).filter(News.id == news_id).first()
    if not news:
        raise ValueError(f"news_id={news_id} not found")

    payload = _analyze_text(news.title, news.content)

    existing = db.query(NewsAnalysis).filter(NewsAnalysis.news_id == news.id).first()
    if existing:
        for k, v in payload.items():
            setattr(existing, k, v)
        record = existing
    else:
        record = NewsAnalysis(news_id=news.id, **payload)
        db.add(record)

    news.topic = payload.get("topic")
    news.sentiment = payload.get("sentiment")

    db.commit()
    db.refresh(record)
    return record


def analyze_pending_news(db: Session, limit: int = 20) -> int:
    existing_ids = [x.news_id for x in db.query(NewsAnalysis.news_id).all()]
    query = db.query(News).order_by(News.collected_at.desc())
    if existing_ids:
        query = query.filter(~News.id.in_(existing_ids))

    news_list = query.limit(limit).all()
    count = 0
    for item in news_list:
        analyze_news(db, item.id)
        count += 1
    return count


def _analyze_text(title: str, content: str) -> dict:
    prompt = _build_prompt(title, content)
    llm_result = _call_ollama(prompt)
    if llm_result:
        parsed = _safe_parse_json(llm_result)
        if parsed:
            return _normalize_analysis(parsed, model=settings.ollama_model)
    return _rule_based_analysis(title, content)


def _build_prompt(title: str, content: str) -> str:
    return (
        "You are a financial and policy news analyst. "
        "Return only valid JSON with this schema: "
        "{summary:string, topic:string, sentiment:string, impact_scope:string, "
        "short_term_outlook:string, mid_term_outlook:string, risk_points:string[], "
        "opportunity_points:string[], confidence:number}. "
        "Sentiment must be one of: positive, neutral, negative. "
        "News title: "
        f"{title}\n"
        "News content: "
        f"{content}"
    )


def _call_ollama(prompt: str) -> str | None:
    try:
        response = requests.post(
            f"{settings.ollama_url}/api/generate",
            json={"model": settings.ollama_model, "prompt": prompt, "stream": False},
            timeout=45,
        )
        response.raise_for_status()
        data = response.json()
        return data.get("response")
    except Exception:
        return None


def _safe_parse_json(text: str) -> dict | None:
    text = text.strip()
    try:
        return json.loads(text)
    except Exception:
        pass

    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        try:
            return json.loads(match.group(0))
        except Exception:
            return None
    return None


def _normalize_analysis(data: dict, model: str) -> dict:
    confidence = int(data.get("confidence", 50))
    confidence = min(max(confidence, 0), 100)

    sentiment = str(data.get("sentiment", "neutral")).lower()
    if sentiment not in {"positive", "neutral", "negative"}:
        sentiment = "neutral"

    risk_points = data.get("risk_points") or []
    if not isinstance(risk_points, list):
        risk_points = [str(risk_points)]

    opportunity_points = data.get("opportunity_points") or []
    if not isinstance(opportunity_points, list):
        opportunity_points = [str(opportunity_points)]

    return {
        "summary": str(data.get("summary", ""))[:4000],
        "topic": str(data.get("topic", "other"))[:80],
        "sentiment": sentiment,
        "impact_scope": str(data.get("impact_scope", "general"))[:120],
        "short_term_outlook": str(data.get("short_term_outlook", ""))[:4000],
        "mid_term_outlook": str(data.get("mid_term_outlook", ""))[:4000],
        "risk_points": [str(x)[:300] for x in risk_points][:8],
        "opportunity_points": [str(x)[:300] for x in opportunity_points][:8],
        "confidence": confidence,
        "model": model,
    }


def _rule_based_analysis(title: str, content: str) -> dict:
    text = f"{title} {content}".lower()
    topic = "macro"
    if any(x in text for x in ["ai", "chip", "software", "cloud"]):
        topic = "technology"
    elif any(x in text for x in ["oil", "gas", "energy", "power"]):
        topic = "energy"
    elif any(x in text for x in ["bank", "credit", "bond", "rate"]):
        topic = "finance"

    sentiment = "neutral"
    if any(x in text for x in ["growth", "surge", "beat", "upgrade"]):
        sentiment = "positive"
    elif any(x in text for x in ["drop", "cuts", "war", "downgrade", "risk"]):
        sentiment = "negative"

    return {
        "summary": f"{title}. {content[:220]}".strip(),
        "topic": topic,
        "sentiment": sentiment,
        "impact_scope": "global market",
        "short_term_outlook": "Volatility may increase while investors digest the update.",
        "mid_term_outlook": "Direction depends on follow-up policy actions and corporate guidance.",
        "risk_points": ["Policy uncertainty", "Cross-market contagion risk"],
        "opportunity_points": ["Theme-based rotation", "Relative-value positioning"],
        "confidence": 58,
        "model": "rule-based",
    }
