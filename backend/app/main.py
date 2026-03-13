from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router, sync_sources
from app.core.config import get_settings
from app.db import Base, SessionLocal, engine
from app.services.jobs import trigger_collect_async

settings = get_settings()
app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[x.strip() for x in settings.cors_origins.split(",") if x.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api")

scheduler = BackgroundScheduler()


@app.on_event("startup")
def startup_event() -> None:
    Base.metadata.create_all(bind=engine)
    _seed_default_sources()

    scheduler.add_job(lambda: trigger_collect_async("schedule"), "interval", minutes=settings.auto_collect_minutes, id="collect")
    scheduler.start()
    trigger_collect_async("startup")


@app.on_event("shutdown")
def shutdown_event() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)


def _seed_default_sources() -> None:
    db = SessionLocal()
    try:
        sync_sources(db)
    finally:
        db.close()
