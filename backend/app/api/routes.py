import os
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Response, Depends
from pydantic import BaseModel, Field

from app.config import settings
from app.services.extractor import extract_and_validate_reflection, ExtractionError, CharacterLimitExceededError
from app.services.similarity import select_best_reference
from app.services.scorer import calculate_deterministic_score, ScoringError
from app.services.excel_exporter import generate_session_assessment_sheet, generate_master_performance_sheet
from integrations.raven.client import RavenWorkerClient
from integrations.raven.schemas import RavenAssessmentRequest

router = APIRouter()
raven_client = RavenWorkerClient(worker_url=settings.raven_worker_url, timeout_seconds=settings.raven_timeout_seconds)

class CandidateReference(BaseModel):
    id: str
    name: str
    extracted_text: str
    keywords: List[str]

class AssessRequest(BaseModel):
    submission_id: str
    session_id: str
    student_usn: str
    reflection_text: str
    candidate_references: List[CandidateReference]
    min_similarity_threshold: Optional[float] = None
    idempotency_key: Optional[str] = None

class AssessResponse(BaseModel):
    submission_id: str
    selected_reference_id: Optional[str]
    similarity_score: float
    matched_keywords: List[str]
    reference_score: int
    calculated_mark: float
    status: str # COMPLETED, NEEDS_REVIEW, FAILED
    qualifies: bool
    evaluation_source: str # "native_engine" or "raven_worker"
    all_similarity_scores: Dict[str, float]

class SessionReportRequest(BaseModel):
    session_id: str
    session_name: str
    records: List[Dict[str, Any]]

class MasterReportRequest(BaseModel):
    sessions: List[Dict[str, str]]
    students: List[Dict[str, Any]]

@router.get("/health")
async def health_check():
    raven_online = await raven_client.is_available() if settings.raven_integration_enabled else False
    return {
        "status": "HEALTHY",
        "service": "Reflection AI Assessment Engine",
        "raven_integration_enabled": settings.raven_integration_enabled,
        "raven_worker_online": raven_online
    }

@router.post("/api/extract")
async def extract_document(
    file: UploadFile = File(...),
    max_chars: Optional[int] = Form(500)
):
    try:
        content = await file.read()
        extracted_text, char_count = extract_and_validate_reflection(
            filename=file.filename or "uploaded.txt",
            file_bytes=content,
            max_characters=max_chars or settings.max_reflection_characters
        )
        return {
            "filename": file.filename,
            "extracted_text": extracted_text,
            "char_count": char_count,
            "status": "VALID"
        }
    except CharacterLimitExceededError as e:
        raise HTTPException(
            status_code=400, 
            detail={"error": "CHARACTER_LIMIT_EXCEEDED", "message": str(e), "char_count": e.char_count}
        )
    except ExtractionError as e:
        raise HTTPException(
            status_code=400, 
            detail={"error": "EXTRACTION_FAILED", "message": str(e)}
        )
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail={"error": "INTERNAL_SERVER_ERROR", "message": str(e)}
        )

@router.post("/api/assess", response_model=AssessResponse)
async def assess_submission(payload: AssessRequest):
    threshold = payload.min_similarity_threshold or settings.min_similarity_threshold
    
    # Check if RAVEN integration should be attempted
    if settings.raven_integration_enabled:
        candidate_keywords = {r.id: r.keywords for r in payload.candidate_references}
        raven_req = RavenAssessmentRequest(
            submission_id=payload.submission_id,
            session_id=payload.session_id,
            student_usn=payload.student_usn,
            reflection_text=payload.reflection_text,
            candidate_reference_ids=[r.id for r in payload.candidate_references],
            candidate_keywords=candidate_keywords,
            idempotency_key=payload.idempotency_key or f"{payload.submission_id}-1"
        )
        raven_resp = await raven_client.dispatch_assessment(raven_req)
        if raven_resp:
            return AssessResponse(
                submission_id=payload.submission_id,
                selected_reference_id=raven_resp.selected_reference_id,
                similarity_score=raven_resp.similarity_score,
                matched_keywords=raven_resp.matched_keywords,
                reference_score=raven_resp.reference_score,
                calculated_mark=raven_resp.calculated_mark,
                status=raven_resp.status,
                qualifies=raven_resp.qualifies,
                evaluation_source="raven_worker",
                all_similarity_scores={}
            )

    # Native Deterministic Engine Execution
    # 1. Multi-reference similarity selection
    raw_refs = [
        {"id": r.id, "extracted_text": r.extracted_text}
        for r in payload.candidate_references
    ]
    selection = select_best_reference(
        reflection_text=payload.reflection_text,
        candidate_references=raw_refs,
        min_threshold=threshold
    )

    if not selection.selected_reference_id or not selection.qualifies:
        return AssessResponse(
            submission_id=payload.submission_id,
            selected_reference_id=selection.selected_reference_id,
            similarity_score=selection.similarity_score,
            matched_keywords=[],
            reference_score=0,
            calculated_mark=0.00,
            status="NEEDS_REVIEW",
            qualifies=False,
            evaluation_source="native_engine",
            all_similarity_scores=selection.all_scores
        )

    # 2. Extract keywords of the selected reference
    chosen_ref = next(
        (r for r in payload.candidate_references if r.id == selection.selected_reference_id), 
        None
    )
    if not chosen_ref:
        raise HTTPException(status_code=500, detail="Selected reference metadata not found.")

    # 3. Deterministic scoring
    try:
        score_res = calculate_deterministic_score(
            reflection_text=payload.reflection_text,
            reference_keywords=chosen_ref.keywords
        )
    except ScoringError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return AssessResponse(
        submission_id=payload.submission_id,
        selected_reference_id=selection.selected_reference_id,
        similarity_score=selection.similarity_score,
        matched_keywords=score_res["matched_keywords"],
        reference_score=score_res["reference_score"],
        calculated_mark=score_res["calculated_mark"],
        status="COMPLETED",
        qualifies=True,
        evaluation_source="native_engine",
        all_similarity_scores=selection.all_scores
    )

@router.post("/api/reports/session-excel")
async def export_session_excel(payload: SessionReportRequest):
    try:
        xlsx_bytes = generate_session_assessment_sheet(
            session_id=payload.session_id,
            session_name=payload.session_name,
            records=payload.records
        )
        return Response(
            content=xlsx_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename=Session_{payload.session_id}_Assessment.xlsx"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate session Excel: {str(e)}")

@router.post("/api/reports/master-excel")
async def export_master_excel(payload: MasterReportRequest):
    try:
        xlsx_bytes = generate_master_performance_sheet(
            sessions=payload.sessions,
            students=payload.students
        )
        return Response(
            content=xlsx_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=Master_Student_Performance.xlsx"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate master Excel: {str(e)}")
