import os
from functools import lru_cache


class IntegrationSettings:
    INTEGRATION_MODE: str = os.getenv("INTEGRATION_MODE", "standalone")
    PULSEQ_MAIN_URL: str = os.getenv("PULSEQ_MAIN_URL", "http://localhost:8000")
    PULSEQ_SHARED_SECRET: str = os.getenv("PULSEQ_SHARED_SECRET", "pulseq-emergency-shared-hmac-secret-2026")


@lru_cache
def get_integration_settings() -> IntegrationSettings:
    return IntegrationSettings()


integration_settings = get_integration_settings()
