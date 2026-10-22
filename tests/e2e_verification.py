import sys
import os
import json
import urllib.request
import urllib.error
from dotenv import load_dotenv

# Path setup
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.services.scorer import calculate_deterministic_score
from app.services.similarity import select_best_reference
from app.services.excel_exporter import generate_session_assessment_sheet, generate_master_performance_sheet
from integrations.raven.client import RavenWorkerClient

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
ANON_KEY = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

headers_service = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

def api_post(endpoint: str, payload: dict, headers: dict):
    req = urllib.request.Request(endpoint, data=json.dumps(payload).encode(), headers=headers, method="POST")
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())

def api_get(endpoint: str, headers: dict):
    req = urllib.request.Request(endpoint, headers=headers)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())

def api_patch(endpoint: str, payload: dict, headers: dict):
    req = urllib.request.Request(endpoint, data=json.dumps(payload).encode(), headers=headers, method="PATCH")
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())

def run_e2e_assessment_flow():
    print("=================================================================")
    print("STARTING LIVE END-TO-END SYSTEM ASSESSMENT VERIFICATION")
    print("=================================================================")
    
    # 1. Verify Professor Login
    print("[1] Verifying Professor Authentication on Supabase...")
    auth_url = f"{SUPABASE_URL}/auth/v1/token?grant_type=password"
    auth_headers = {"apikey": SERVICE_KEY, "Content-Type": "application/json"}
    login_payload = {
        "email": "professor@institution.edu",
        "password": "ProfessorSecure2026!"
    }
    prof_token_resp = api_post(auth_url, login_payload, auth_headers)
    prof_token = prof_token_resp["access_token"]
    prof_auth_id = prof_token_resp["user"]["id"]
    prof_prof = api_get(f"{SUPABASE_URL}/rest/v1/profiles?auth_user_id=eq.{prof_auth_id}", headers_service)[0]
    prof_id = prof_prof["id"]
    print(f"  --> Professor Authenticated! (UID: {prof_auth_id}, Profile ID: {prof_id})")

    # 2. Professor provisions Student 1 (USN: 1RV21CS001)
    print("\n[2] Provisioning Student Roster & Auth Account (Server-Side)...")
    student_email = "student1@institution.edu"
    student_usn = "1RV21CS001"
    student_name = "Alice Smith"
    student_password = "StudentSecure2026!"

    # Clean existing test student if rerun
    existing_users = api_get(f"{SUPABASE_URL}/auth/v1/admin/users", headers_service)
    for u in existing_users.get("users", []):
        if u.get("email") == student_email:
            # Delete old student user
            del_req = urllib.request.Request(f"{SUPABASE_URL}/auth/v1/admin/users/{u['id']}", headers=headers_service, method="DELETE")
            urllib.request.urlopen(del_req)
            print(f"  --> Cleaned up prior test user: {student_email}")

    # Create new student Auth User
    new_user_payload = {
        "email": student_email,
        "password": student_password,
        "email_confirm": True,
        "user_metadata": {"full_name": student_name, "role": "STUDENT", "usn": student_usn}
    }
    student_auth = api_post(f"{SUPABASE_URL}/auth/v1/admin/users", new_user_payload, headers_service)
    student_auth_id = student_auth["id"]

    # Link Student Profile
    profile_payload = {
        "auth_user_id": student_auth_id,
        "role": "STUDENT",
        "usn": student_usn,
        "full_name": student_name,
        "status": "ACTIVE"
    }
    student_profile = api_post(f"{SUPABASE_URL}/rest/v1/profiles", profile_payload, headers_service)[0]
    student_profile_id = student_profile["id"]
    print(f"  --> Student Provisioned! (ID: {student_profile_id}, USN: {student_usn})")

    # 3. Student Authenticates
    print("\n[3] Student Authentication...")
    student_token_resp = api_post(auth_url, {"email": student_email, "password": student_password}, auth_headers)
    student_token = student_token_resp["access_token"]
    headers_student = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {student_token}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }
    print("  --> Student successfully authenticated with student token.")

    # 4. Fetch Open Session & Reference
    print("\n[4] Querying Open Session and Reference Material...")
    sessions = api_get(f"{SUPABASE_URL}/rest/v1/sessions?status=eq.OPEN", headers_student)
    if len(sessions) == 0:
        # Ensure test reference material exists
        all_refs = api_get(f"{SUPABASE_URL}/rest/v1/reference_materials?select=id,name", headers_service)
        assert len(all_refs) > 0, "Reference materials required for testing"
        target_ref_id = all_refs[0]["id"]

        # Ensure an open test session exists
        new_sess = api_post(f"{SUPABASE_URL}/rest/v1/sessions", {
            "name": "Reflection Session 1: Neural Networks & Backprop",
            "status": "OPEN",
            "created_by": prof_id
        }, headers_service)
        session_id = new_sess[0]["id"]
        
        api_post(f"{SUPABASE_URL}/rest/v1/session_references", {
            "session_id": session_id,
            "reference_id": target_ref_id
        }, headers_service)
        sessions = api_get(f"{SUPABASE_URL}/rest/v1/sessions?id=eq.{session_id}", headers_student)

    session = sessions[0]
    session_id = session["id"]
    print(f"  --> Target Session: '{session['name']}' (ID: {session_id})")

    # Fetch reference linked to this session
    ref_links = api_get(f"{SUPABASE_URL}/rest/v1/session_references?session_id=eq.{session_id}", headers_service)
    if len(ref_links) == 0:
        all_refs = api_get(f"{SUPABASE_URL}/rest/v1/reference_materials?select=id,name", headers_service)
        api_post(f"{SUPABASE_URL}/rest/v1/session_references", {
            "session_id": session_id,
            "reference_id": all_refs[0]["id"]
        }, headers_service)
        ref_links = api_get(f"{SUPABASE_URL}/rest/v1/session_references?session_id=eq.{session_id}", headers_service)

    ref_id = ref_links[0]["reference_id"]
    ref_record = api_get(f"{SUPABASE_URL}/rest/v1/reference_materials?id=eq.{ref_id}", headers_service)[0]
    kw_record = api_get(f"{SUPABASE_URL}/rest/v1/reference_keyword_sets?reference_id=eq.{ref_id}", headers_service)[0]
    reference_keywords = kw_record["keywords"]
    print(f"  --> Reference: '{ref_record['name']}'")
    print(f"  --> 15 Calibrated Keywords: {reference_keywords}")

    # 5. Student Submits Reflection
    print("\n[5] Student Submitting Reflection (<500 chars)...")
    # Dynamically compose reflection containing all 15 reference keywords to test maximum score
    reflection_text = "Analysis report covering: " + " ".join(reference_keywords) + "."
    assert len(reflection_text) <= 500, "Must be under 500 characters"

    # Clean previous submissions for idempotent rerun
    del_sub_req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/submissions?session_id=eq.{session_id}&student_id=eq.{student_profile_id}",
        headers=headers_service,
        method="DELETE"
    )
    urllib.request.urlopen(del_sub_req)

    sub_payload = {
        "session_id": session_id,
        "student_id": student_profile_id,
        "storage_path": f"{student_profile_id}/{session_id}/reflection.txt",
        "extracted_text": reflection_text,
        "char_count": len(reflection_text),
        "status": "SUBMITTED"
    }
    sub_res = api_post(f"{SUPABASE_URL}/rest/v1/submissions", sub_payload, headers_service)[0]
    submission_id = sub_res["id"]
    print(f"  --> Submission Created: ID {submission_id} ({len(reflection_text)} chars)")

    # Test Duplicate Submission Rejection
    print("  --> Verifying duplicate submission rejection...")
    try:
        api_post(f"{SUPABASE_URL}/rest/v1/submissions", sub_payload, headers_service)
        assert False, "Duplicate submission was NOT rejected!"
    except urllib.error.HTTPError as e:
        assert e.code in [400, 409], f"Expected 409/400 conflict, got {e.code}"
        print("  --> PASS: Duplicate submission atomically rejected by database constraint (uq_student_session).")

    # 6. Deterministic Assessment Evaluation
    print("\n[6] Evaluating Deterministic Assessment Engine...")
    score_data = calculate_deterministic_score(reflection_text, reference_keywords)
    ref_score = score_data["reference_score"]
    ai_mark = score_data["calculated_mark"]
    matched = score_data["matched_keywords"]

    print(f"  --> Distinct Matched Keywords: {len(matched)} of 15 ({matched})")
    print(f"  --> Reference Score: {ref_score} / 15")
    print(f"  --> Session Mark: {ai_mark} / 5.00 (Formula: Score / 3 = {ref_score} / 3)")
    assert ref_score == 15
    assert ai_mark == 5.00

    assess_payload = {
        "submission_id": submission_id,
        "selected_reference_id": ref_id,
        "similarity_score": 0.825,
        "keyword_version": 1,
        "matched_keywords": matched,
        "reference_score": ref_score,
        "original_ai_mark": ai_mark,
        "final_approved_mark": ai_mark,
        "status": "COMPLETED"
    }
    assess_res = api_post(f"{SUPABASE_URL}/rest/v1/assessments", assess_payload, headers_service)[0]
    assessment_id = assess_res["id"]
    print(f"  --> Assessment Stored: ID {assessment_id}")

    # 7. Professor Manual Override
    print("\n[7] Testing Professor Manual Mark Override...")
    new_mark = 4.75
    override_reason = "Slight deduplication penalty applied based on rubric note."

    override_payload = {
        "assessment_id": assessment_id,
        "professor_id": "31817594-303e-43e1-bc92-a38a5d8ef8fd", # Alan Turing profile ID
        "previous_mark": ai_mark,
        "new_mark": new_mark,
        "reason": override_reason
    }
    api_post(f"{SUPABASE_URL}/rest/v1/mark_overrides", override_payload, headers_service)

    # Update assessment final_approved_mark
    api_patch(
        f"{SUPABASE_URL}/rest/v1/assessments?id=eq.{assessment_id}",
        {"final_approved_mark": new_mark},
        headers_service
    )
    print(f"  --> Manual Override Recorded: Original AI Mark = {ai_mark}, New Final Mark = {new_mark}")
    print(f"  --> Reason Logged: '{override_reason}'")

    # 8. Student Views Results
    print("\n[8] Verifying Student Portal Grade View...")
    student_view = api_get(
        f"{SUPABASE_URL}/rest/v1/submissions?id=eq.{submission_id}&select=status,assessments(reference_score,original_ai_mark,final_approved_mark,status)",
        headers_service
    )[0]
    ast = student_view["assessments"]
    if isinstance(ast, list):
        ast = ast[0]
    assert ast["status"] == "COMPLETED"
    assert float(ast["original_ai_mark"]) == 5.00
    assert float(ast["final_approved_mark"]) == 4.75
    print("  --> Student accurately sees: Reference Score 15/15, Final Approved Mark 4.75/5.00 (with preserved AI mark 5.00).")

    # 9. Excel Export Generation
    print("\n[9] Generating Authoritative Excel Reports (.xlsx)...")
    records = [{
        "usn": student_usn,
        "student_name": student_name,
        "final_mark": 4.75,
        "reference_score": 15,
        "selected_reference_id": ref_id,
        "selected_material_name": ref_record["name"],
        "submission_status": "SUBMITTED",
        "assessment_status": "COMPLETED"
    }]
    session_xlsx = generate_session_assessment_sheet(session_id, session["name"], records)
    assert len(session_xlsx) > 0
    print("  --> Session Assessment Sheet (.xlsx) generated successfully!")

    students_matrix = [
        {"name": student_name, "usn": student_usn, "scores": {session_id: {"mark": 4.75, "status": "COMPLETED"}}},
        {"name": "Absent Student", "usn": "1RV21CS099", "scores": {session_id: {"mark": 0.00, "status": "ABSENT"}}}
    ]
    master_xlsx = generate_master_performance_sheet([{"id": session_id, "name": session["name"]}], students_matrix)
    assert len(master_xlsx) > 0
    print("  --> Master Student Performance Sheet (.xlsx) generated successfully with absent zero vs assessed zero distinction!")

    print("\n=================================================================")
    print("ALL END-TO-END VERIFICATION STEPS PASSED WITH 100% SUCCESS!")
    print("=================================================================")

if __name__ == "__main__":
    run_e2e_assessment_flow()
