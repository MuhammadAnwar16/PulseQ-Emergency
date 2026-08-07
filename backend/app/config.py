import os
from functools import lru_cache


class Settings:
    PROJECT_NAME: str = "PulseQ Emergency Portal API"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"

    # Environment & Integration Mode
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    INTEGRATION_MODE: str = os.getenv("INTEGRATION_MODE", "standalone")
    SEED_DEMO_DATA: bool = os.getenv("SEED_DEMO_DATA", "true").lower() in ("true", "1", "yes")

    # Database — PostgreSQL default with SQLite dev fallback
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql://postgres:postgres@localhost:5432/pulseq_emergency"
    )

    # Auth Security
    JWT_SECRET: str = os.getenv("JWT_SECRET", "emergency-portal-dev-secret-key-2026")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # Rate Limiting / Lockout (5 attempts, 15 minute cooldown)
    MAX_LOGIN_ATTEMPTS: int = 5
    LOCKOUT_MINUTES: int = 15

    # Integration HMAC Shared Secret
    PULSEQ_SHARED_SECRET: str = os.getenv("PULSEQ_SHARED_SECRET", "pulseq-emergency-shared-hmac-secret-2026")

    # CORS Allowed Origins
    CORS_ORIGINS: list[str] = [
        o.strip()
        for o in os.getenv(
            "CORS_ORIGINS",
            "https://pulse-q-emergency.vercel.app,http://localhost:4200,http://localhost:4201,http://localhost:3000,http://127.0.0.1:4200,http://127.0.0.1:4201",
        ).split(",")
        if o.strip()
    ]

    # PDF storage
    REPORTS_DIR: str = os.getenv("REPORTS_DIR", "./reports")

    # Default Hospital ID
    DEFAULT_HOSPITAL_ID: str = "HOSP-01"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

