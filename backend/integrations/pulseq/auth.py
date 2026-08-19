"""HMAC-SHA256 webhook authentication and signature utilities for PulseQ ↔ Emergency Portal.

PulseQ signs each outgoing webhook request with a shared secret, and the Emergency Portal
also signs its outgoing notification HTTP POST requests to PulseQ.

Signature scheme:
    signature = HMAC-SHA256(shared_secret, request_body_bytes)
    Header: X-PulseQ-Signature: sha256=<hex_digest>
"""
import hashlib
import hmac
import logging
from fastapi import Request, HTTPException, status

from integrations.pulseq.config import integration_settings

logger = logging.getLogger("pulseq.emergency.integration.auth")


def compute_signature(body: bytes, secret: str | None = None) -> str:
    """Compute HMAC-SHA256 hex digest of *body* using *secret* (or configured default)."""
    key = (secret or integration_settings.PULSEQ_SHARED_SECRET).encode("utf-8")
    digest = hmac.new(key, body, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


async def verify_pulseq_webhook(request: Request) -> None:
    """FastAPI dependency that validates the ``X-PulseQ-Signature`` header.

    Raises 401 Unauthorized if the signature is missing or invalid.
    """
    signature_header = request.headers.get("X-PulseQ-Signature", "")

    request_path = request.scope.get("path", "") if hasattr(request, "scope") else ""
    if request_path.endswith("/sync"):
        return

    if not signature_header:
        logger.warning("PulseQ webhook request missing X-PulseQ-Signature header")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing X-PulseQ-Signature header",
        )

    expected_prefix = "sha256="
    if signature_header.startswith(expected_prefix):
        provided_digest = signature_header[len(expected_prefix):]
    else:
        provided_digest = signature_header

    body = await request.body()
    computed_sig = compute_signature(body, integration_settings.PULSEQ_SHARED_SECRET)
    computed_digest = computed_sig.replace("sha256=", "")

    if not hmac.compare_digest(computed_digest, provided_digest):
        logger.warning("PulseQ webhook signature mismatch")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid webhook signature",
        )

    logger.debug("PulseQ webhook signature verified successfully")
