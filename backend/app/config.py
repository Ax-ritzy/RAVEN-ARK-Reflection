import os
from dotenv import load_dotenv

# Automatically load .env from root or backend directory
env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))
if os.path.exists(env_path):
    load_dotenv(env_path)
else:
    load_dotenv()

class Settings:
    def __init__(self):
        self.supabase_url: str = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
        self.supabase_service_role_key: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
        self.internal_api_secret_key: str = os.getenv("INTERNAL_API_SECRET_KEY", "ref-internal-sec-2026")
        self.min_similarity_threshold: float = float(os.getenv("MIN_SIMILARITY_THRESHOLD", "0.35"))
        self.max_reflection_characters: int = int(os.getenv("MAX_REFLECTION_CHARACTERS", "500"))
        
        # RAVEN Worker Integration
        self.raven_integration_enabled: bool = os.getenv("RAVEN_INTEGRATION_ENABLED", "false").lower() == "true"
        self.raven_worker_url: str = os.getenv("RAVEN_WORKER_URL", "http://127.0.0.1:8010")
        self.raven_timeout_seconds: int = int(os.getenv("RAVEN_TIMEOUT_SECONDS", "15"))

        # Ollama Qwen Integration
        self.ollama_url: str = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")
        self.ollama_model: str = os.getenv("OLLAMA_MODEL", "qwen3.5:4b")
        self.ollama_enabled: bool = os.getenv("OLLAMA_ENABLED", "true").lower() == "true"
        self.ollama_timeout_seconds: int = int(os.getenv("OLLAMA_TIMEOUT_SECONDS", "30"))

settings = Settings()
