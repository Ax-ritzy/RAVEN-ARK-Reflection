import httpx
from datetime import datetime, timezone
from integrations.raven.schemas import RavenHealthResponse

async def check_raven_health(worker_url: str, timeout_seconds: int = 3) -> RavenHealthResponse:
    """
    Non-blocking health ping to verify whether the local RAVEN worker is alive.
    If unavailable or timed out, gracefully returns available=False.
    """
    try:
        async with httpx.AsyncClient(timeout=timeout_seconds) as client:
            resp = await client.get(f"{worker_url.rstrip('/')}/health")
            if resp.status_code == 200:
                data = resp.json()
                return RavenHealthResponse(
                    available=True,
                    status="HEALTHY",
                    worker_version=data.get("version", "1.0.0"),
                    active_jobs=data.get("active_jobs", 0),
                    checked_at=datetime.now(timezone.utc)
                )
    except Exception as e:
        pass

    return RavenHealthResponse(
        available=False,
        status="OFFLINE",
        worker_version=None,
        active_jobs=0,
        checked_at=datetime.now(timezone.utc)
    )
