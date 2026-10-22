# Architecture Specification: Reflection AI Assessment System

## 1. System Topology

The Reflection AI Assessment System consists of:
1. **Student Portal (`student-portal/`):** Next.js application for student login, session inspection, reflection uploads (TXT, DOCX, PDF), live character validation, and published grade views.
2. **Professor Admin Portal (`professor-portal/`):** Next.js application providing complete institutional administration: student roster management, server-side Supabase Auth user provisioning, session lifecycle (OPEN/CLOSED), reference material management (15 keywords per reference), submission review, manual mark overrides, and Excel report generation.
3. **Authoritative Supabase PostgreSQL Database:** Stores all identity records, role bindings, sessions, references, keywords, submissions, assessments, and override audit logs with Row-Level Security (RLS).
4. **FastAPI Assessment Service (`backend/`):** Python service for multi-format text extraction, cosine/TF-IDF similarity selection across multiple reference texts, deterministic 15-keyword evaluation, and openpyxl-based XLSX report generation.
5. **Future RAVEN Integration Layer (`integrations/raven/`):** Contract-driven integration module for outbound polling or asynchronous execution by the local RAVEN agent.

---

## 2. Core Workflow & Lifecycle

```
[Student Submits File (PDF/DOCX/TXT)]
                │
                ▼
[FastAPI Extractor validates body length <= 500 chars]
                │
                ▼
[Database Record: submission status = 'SUBMITTED']
                │
                ▼
[Assessment Engine evaluates session's assigned references]
                │
                ├─ Compare reflection vs each reference (TF-IDF Cosine Similarity)
                ├─ Select highest-similarity reference
                │
                ▼
[Similarity >= threshold (0.35)?]
     ├── NO  ──► Status = 'NEEDS_REVIEW' (Flagged for professor)
     └── YES ──►
                │
                ▼
[Deterministic Scoring against Reference's 15 Keywords]
     ├─ Count distinct reference keywords found in reflection
     ├─ Reference Score = [0 to 15] (Integer)
     ├─ Original AI Mark = Reference Score / 3 (0.00 to 5.00)
     └─ Final Approved Mark = Original AI Mark
                │
                ▼
[Status = 'COMPLETED', Published to Student & Professor Portals]
                │
                ▼
[Optional: Professor Manual Override]
     ├─ Retains original_ai_mark
     ├─ Sets new final_approved_mark
     └─ Appends to mark_overrides audit log with reason & timestamp
```

---

## 3. Security & Access Boundaries

1. **Service Role Isolation:** The Supabase `service_role` key is strictly kept in server environments (`process.env.SUPABASE_SERVICE_ROLE_KEY` inside Next.js server actions/API routes and the FastAPI backend). It is **never** bundled into client-side code.
2. **Row-Level Security (RLS):**
   - Students cannot read submissions or marks of other students.
   - Students cannot create or alter sessions, references, or assessments.
   - Professors have administrative access across all records for grading, auditing, and roster management.
3. **Deterministic Scoring Invariant:**
   - Marks are computed purely through deterministic arithmetic code: $\text{Mark} = \frac{\text{Score}}{3}$.
   - No subjective model hallucinations can alter grades.
4. **Identity Verification:**
   - The extraction pipeline inspects reflections for embedded USN/Student IDs and compares them against the authenticated student. Mismatches are flagged for professor review.
