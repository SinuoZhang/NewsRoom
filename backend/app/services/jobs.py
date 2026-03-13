from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import datetime, timedelta
from threading import Lock

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db import SessionLocal
from app.models import JobLog, News, NewsAnalysis, RawNews
from app.services.analyzer import analyze_pending_news
from app.services.collector import collect_from_sources

_executor = ThreadPoolExecutor(max_workers=1)
_status_lock = Lock()
settings = get_settings()
_collect_status = {
    "running": False,
    "reason": None,
    "started_at": None,
    "finished_at": None,
    "source_total": 0,
    "source_done": 0,
    "current_source": None,
    "fetched_count": 0,
    "inserted_count": 0,
    "duplicate_count": 0,
    "last_result": None,
    "last_error": None,
    "retention_days": settings.retention_days,
    "pruned": {"news": 0, "raw_news": 0, "analysis": 0},
}


def get_collect_status() -> dict:
    with _status_lock:
        return deepcopy(_collect_status)


def trigger_collect_async(reason: str = "manual") -> bool:
    with _status_lock:
        if _collect_status["running"]:
            return False
    _executor.submit(run_collect_job, reason)
    return True


def _on_collect_progress(payload: dict) -> None:
    with _status_lock:
        _collect_status["source_total"] = int(payload.get("source_total", _collect_status["source_total"]))
        _collect_status["source_done"] = int(payload.get("source_done", _collect_status["source_done"]))
        _collect_status["current_source"] = payload.get("current_source")
        _collect_status["fetched_count"] = int(payload.get("fetched_count", _collect_status["fetched_count"]))
        _collect_status["inserted_count"] = int(payload.get("inserted_count", _collect_status["inserted_count"]))
        _collect_status["duplicate_count"] = int(payload.get("duplicate_count", _collect_status["duplicate_count"]))


def _prune_expired_news(db: Session, retention_days: int) -> dict:
    cutoff = datetime.utcnow() - timedelta(days=retention_days)

    old_news_ids = [x[0] for x in db.query(News.id).filter(News.collected_at < cutoff).all()]
    deleted_analysis = 0
    deleted_news = 0
    if old_news_ids:
        deleted_analysis = db.query(NewsAnalysis).filter(NewsAnalysis.news_id.in_(old_news_ids)).delete(synchronize_session=False)
        deleted_news = db.query(News).filter(News.id.in_(old_news_ids)).delete(synchronize_session=False)

    deleted_raw = db.query(RawNews).filter(RawNews.created_at < cutoff).delete(synchronize_session=False)

    return {"news": int(deleted_news or 0), "raw_news": int(deleted_raw or 0), "analysis": int(deleted_analysis or 0)}


def run_collect_job(reason: str = "manual") -> dict:
    with _status_lock:
        if _collect_status["running"]:
            return {"status": "skipped", "reason": "already_running"}
        _collect_status.update(
            {
                "running": True,
                "reason": reason,
                "started_at": datetime.utcnow().isoformat(),
                "finished_at": None,
                "source_total": 0,
                "source_done": 0,
                "current_source": None,
                "fetched_count": 0,
                "inserted_count": 0,
                "duplicate_count": 0,
                "last_error": None,
                "pruned": {"news": 0, "raw_news": 0, "analysis": 0},
            }
        )

    db: Session = SessionLocal()
    try:
        pruned = _prune_expired_news(db, retention_days=settings.retention_days)
        with _status_lock:
            _collect_status["pruned"] = pruned

        result = collect_from_sources(db, progress_callback=_on_collect_progress)
        result["pruned"] = pruned
        _log_job(db, "collect", "success", result)
        with _status_lock:
            _collect_status["last_result"] = result
        return result
    except Exception as exc:
        _log_job(db, "collect", "failed", {"error": str(exc)})
        with _status_lock:
            _collect_status["last_error"] = str(exc)
        raise
    finally:
        with _status_lock:
            _collect_status["running"] = False
            _collect_status["finished_at"] = datetime.utcnow().isoformat()
        db.close()


def run_analyze_job() -> None:
    db: Session = SessionLocal()
    try:
        analyzed = analyze_pending_news(db, limit=30)
        _log_job(db, "analyze", "success", {"analyzed": analyzed})
    except Exception as exc:
        _log_job(db, "analyze", "failed", {"error": str(exc)})
    finally:
        db.close()


def _log_job(db: Session, job_type: str, status: str, meta: dict) -> None:
    log = JobLog(job_type=job_type, status=status, meta_json={**meta, "at": datetime.utcnow().isoformat()})
    db.add(log)
    db.commit()
