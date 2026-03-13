from datetime import datetime

from pydantic import BaseModel


class SourceOut(BaseModel):
    id: int
    name: str
    rss_url: str
    category: str
    is_active: bool

    class Config:
        from_attributes = True


class AnalysisOut(BaseModel):
    summary: str
    topic: str
    sentiment: str
    impact_scope: str
    short_term_outlook: str
    mid_term_outlook: str
    risk_points: list[str]
    opportunity_points: list[str]
    confidence: int
    model: str

    class Config:
        from_attributes = True


class NewsOut(BaseModel):
    id: int
    source_id: int
    source_name: str
    source_timezone: str
    title: str
    url: str
    content: str
    published_at: datetime | None
    collected_at: datetime
    impact_score: float
    topic: str | None
    sentiment: str | None
    analysis: AnalysisOut | None = None


class CollectResult(BaseModel):
    source_count: int
    fetched_count: int
    inserted_count: int
    duplicate_count: int
    pruned: dict[str, int] | None = None


class DailyOutlook(BaseModel):
    generated_at: datetime
    coverage_count: int
    topics: dict[str, int]
    sentiment: dict[str, int]
    highlights: list[str]


class LlmChatIn(BaseModel):
    message: str
    mode: str = "filtered"
    use_news_context: bool = True
    q: str | None = None
    source_id: int | None = None
    region: str | None = None
    news_ids: list[int] = []
    limit: int = 30


class LlmChatOut(BaseModel):
    answer: str
    provider: str
    model: str
    used_news_count: int


class LlmModelSelectIn(BaseModel):
    model: str


class LlmModelsOut(BaseModel):
    provider: str
    current_model: str
    models: list[str]
    can_switch: bool


class LlmConfigOut(BaseModel):
    provider: str
    current_model: str
    openai_model: str
    gemini_model: str
    ollama_model: str
    ollama_available: bool
    openai_configured: bool
    gemini_configured: bool


class LlmConfigIn(BaseModel):
    provider: str
    model: str | None = None
    openai_api_key: str | None = None
    openai_model: str | None = None
    gemini_api_key: str | None = None
    gemini_model: str | None = None
    persist: bool = True


class LlmMemoryAppendIn(BaseModel):
    role: str
    text: str


class MarketItemOut(BaseModel):
    key: str
    label: str
    symbol: str
    source: str
    price: float | None
    unit: str
    change_pct: float | None
    updated_at: datetime


class MarketSnapshotOut(BaseModel):
    source: str
    updated_at: datetime
    items: list[MarketItemOut]


class FinanceHeadlineOut(BaseModel):
    id: int
    source_name: str
    title: str
    url: str
    published_at: datetime | None
