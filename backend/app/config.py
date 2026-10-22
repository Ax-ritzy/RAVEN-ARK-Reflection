import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    supabase_url: str = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
    supabase_service_role_key: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    internal_api_secret_key: str = os.getenv("INTERNAL_API_SECRET_KEY", "dev-secret-key")
    min_similarity_threshold: float = float(os.getenv("MIN_SIMILARITY_THRESHOLD", "0.35"))
    max_reflection_characters: int = int(os.getenv("MAX_REFLECTION_CHARACTERS", "500"))
    
    # RAVEN Worker Integration
    raven_integration_enabled: bool = os.getenv("RAVEN_INTEGRATION_ENABLED", "false").lower() == "true"
    raven_worker_url: str = os.getenv("RAVEN_WORKER_URL", "http://127.0.0.1:8010")
    raven_timeout_seconds: int = int(os.getenv("RAVEN_TIMEOUT_SECONDS", "15"))

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
