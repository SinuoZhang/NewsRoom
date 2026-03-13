from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Source(Base):
    __tablename__ = "sources"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    rss_url: Mapped[str] = mapped_column(String(500), nullable=False, unique=True)
    category: Mapped[str] = mapped_column(String(80), default="general")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    raw_items = relationship("RawNews", back_populates="source")
    news_items = relationship("News", back_populates="source")


class RawNews(Base):
    __tablename__ = "raw_news"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    source_id: Mapped[int] = mapped_column(ForeignKey("sources.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    url: Mapped[str] = mapped_column(String(1000), nullable=False)
    published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    payload_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    source = relationship("Source", back_populates="raw_items")


class News(Base):
    __tablename__ = "news"
    __table_args__ = (UniqueConstraint("url_hash", name="uq_news_url_hash"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    source_id: Mapped[int] = mapped_column(ForeignKey("sources.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    url: Mapped[str] = mapped_column(String(1000), nullable=False)
    url_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    content: Mapped[str] = mapped_column(Text, default="")
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    collected_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    impact_score: Mapped[float] = mapped_column(Float, default=0.0)
    topic: Mapped[str | None] = mapped_column(String(80), nullable=True)
    sentiment: Mapped[str | None] = mapped_column(String(30), nullable=True)

    source = relationship("Source", back_populates="news_items")
    analysis = relationship("NewsAnalysis", back_populates="news", uselist=False)


class NewsAnalysis(Base):
    __tablename__ = "news_analysis"
    __table_args__ = (UniqueConstraint("news_id", name="uq_news_analysis_news_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    news_id: Mapped[int] = mapped_column(ForeignKey("news.id"), nullable=False)
    summary: Mapped[str] = mapped_column(Text, default="")
    topic: Mapped[str] = mapped_column(String(80), default="other")
    sentiment: Mapped[str] = mapped_column(String(30), default="neutral")
    impact_scope: Mapped[str] = mapped_column(String(120), default="general")
    short_term_outlook: Mapped[str] = mapped_column(Text, default="")
    mid_term_outlook: Mapped[str] = mapped_column(Text, default="")
    risk_points: Mapped[list] = mapped_column(JSON, default=list)
    opportunity_points: Mapped[list] = mapped_column(JSON, default=list)
    confidence: Mapped[int] = mapped_column(Integer, default=50)
    model: Mapped[str] = mapped_column(String(120), default="rule-based")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    news = relationship("News", back_populates="analysis")


class JobLog(Base):
    __tablename__ = "jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    job_type: Mapped[str] = mapped_column(String(80), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    meta_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
