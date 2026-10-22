from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime

class RavenAssessmentRequest(BaseModel):
    submission_id: str
    session_id: str
    student_usn: str
    reflection_text: str = Field(..., max_length=500)
    candidate_reference_ids: List[str]
    candidate_keywords: Dict[str, List[str]] # reference_id -> 15 keywords
    idempotency_key: str

class RavenAssessmentResponse(BaseModel):
    submission_id: str
    selected_reference_id: str
    similarity_score: float
    matched_keywords: List[str]
    reference_score: int = Field(..., ge=0, le=15)
    calculated_mark: float = Field(..., ge=0.0, le=5.0)
    qualifies: bool
    status: str # "COMPLETED", "NEEDS_REVIEW", "FAILED"
    evaluated_at: datetime
    execution_time_ms: int
    worker_node_id: Optional[str] = "local-raven-node"

class RavenHealthResponse(BaseModel):
    available: bool
    status: str
    worker_version: Optional[str] = None
    active_jobs: int = 0
    checked_at: datetime
