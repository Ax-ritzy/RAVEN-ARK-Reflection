import httpx
import logging
from typing import Optional, Dict, Any
from datetime import datetime, timezone

from integrations.raven.schemas import (
    RavenAssessmentRequest, 
    RavenAssessmentResponse, 
    RavenHealthResponse
)
from integrations.raven.health import check_raven_health

logger = logging.getLogger("raven_integration")

class RavenClientException(Exception):
    pass

class RavenWorkerClient:
    def __init__(self, worker_url: str = "http://127.0.0.1:8010", timeout_seconds: int = 15):
        self.worker_url = worker_url.rstrip("/")
        self.timeout_seconds = timeout_seconds

    async def is_available(self) -> bool:
        health: RavenHealthResponse = await check_raven_health(self.worker_url, timeout_seconds=3)
        return health.available

    async def dispatch_assessment(
        self, 
        request: RavenAssessmentRequest
    ) -> Optional[RavenAssessmentResponse]:
        """
        Dispatches an assessment request to the RAVEN worker node.
        If offline or unreachable, returns None so the calling system
        can transparently fall back to native deterministic scoring.
        """
        endpoint = f"{self.worker_url}/api/v1/assess"
        headers = {
            "Content-Type": "application/json",
            "X-Idempotency-Key": request.idempotency_key
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                resp = await client.post(endpoint, json=request.model_dump(), headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    return RavenAssessmentResponse(**data)
                else:
                    logger.warning(f"RAVEN worker responded with HTTP {resp.status_code}: {resp.text}")
                    return None
        except (httpx.ConnectError, httpx.TimeoutException) as e:
            logger.info(f"RAVEN worker offline or unreachable ({str(e)}). Falling back to native engine.")
            return None
        except Exception as e:
            logger.error(f"Unexpected error communicating with RAVEN worker: {str(e)}")
            return None
