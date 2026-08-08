import os
from functools import lru_cache


class IntegrationSettings:
    INTEGRATION_MODE: str = os.getenv("INTEGRATION_MODE", "standalone")
    PULSEQ_API_BASE_URL: str = os.getenv(
        "PULSEQ_API_BASE_URL",
        os.getenv("PULSEQ_MAIN_URL", "https://api.pulseq.health")
    )
    PULSEQ_SHARED_SECRET: str = os.getenv(
        "PULSEQ_SHARED_SECRET", "pulseq-emergency-shared-hmac-secret-2026"
    )

    @property
    def is_active(self) -> bool:
        return self.INTEGRATION_MODE == "pulseq_connected"


@lru_cache
def get_integration_settings() -> IntegrationSettings:
    return IntegrationSettings()


integration_settings = get_integration_settings()
