from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "NewsRoom"
    database_url: str = "sqlite:///./newsroom.db"
    cors_origins: str = "http://localhost:5173"

    ollama_url: str = "http://localhost:11434"
    ollama_model: str = "gpt-oss:120b-cloud"
    llm_provider: str = "ollama"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-1.5-flash"
    translate_api_url: str = "https://translate.argosopentech.com/translate"

    auto_collect_minutes: int = 10
    retention_days: int = 3


@lru_cache
def get_settings() -> Settings:
    return Settings()
