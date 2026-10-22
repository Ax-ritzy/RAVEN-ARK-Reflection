-- =================================================================
-- MIGRATION 001: INITIAL SCHEMA FOR REFLECTION AI ASSESSMENT SYSTEM
-- Authoritative Schema for Profiles, Sessions, References, Submissions,
-- Assessments, and Mark Overrides.
-- =================================================================

-- 1. Profiles Table (Linked to Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('STUDENT', 'PROFESSOR')),
    usn VARCHAR(50) UNIQUE,
    full_name TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_student_usn CHECK (role != 'STUDENT' OR usn IS NOT NULL)
);

-- 2. Sessions Table
CREATE TABLE IF NOT EXISTS public.sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
    created_by UUID NOT NULL REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Reference Materials Table
CREATE TABLE IF NOT EXISTS public.reference_materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    extracted_text TEXT,
    uploaded_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Session References (Many-to-Many: multiple references per session)
CREATE TABLE IF NOT EXISTS public.session_references (
    session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    reference_id UUID NOT NULL REFERENCES public.reference_materials(id) ON DELETE CASCADE,
    PRIMARY KEY (session_id, reference_id)
);

-- 5. Reference Keyword Sets (Versioned, exactly 15 distinct keywords per reference)
CREATE TABLE IF NOT EXISTS public.reference_keyword_sets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference_id UUID NOT NULL REFERENCES public.reference_materials(id) ON DELETE CASCADE,
    version INTEGER NOT NULL DEFAULT 1,
    keywords TEXT[] NOT NULL CHECK (array_length(keywords, 1) = 15),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Submissions Table (Max 500 characters, atomic 1 per student per session)
CREATE TABLE IF NOT EXISTS public.submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    extracted_text TEXT NOT NULL,
    char_count INTEGER NOT NULL CHECK (char_count >= 0 AND char_count <= 500),
    status VARCHAR(20) NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED', 'REJECTED', 'FLAGGED')),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_student_session UNIQUE (session_id, student_id)
);

-- 7. Assessments Table (Deterministic scoring: Ref Score 0..15, Mark 0.00..5.00)
CREATE TABLE IF NOT EXISTS public.assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE UNIQUE,
    selected_reference_id UUID REFERENCES public.reference_materials(id),
    similarity_score DOUBLE PRECISION DEFAULT 0.0,
    keyword_version INTEGER DEFAULT 1,
    matched_keywords TEXT[] DEFAULT '{}',
    reference_score INTEGER NOT NULL DEFAULT 0 CHECK (reference_score >= 0 AND reference_score <= 15),
    original_ai_mark NUMERIC(4,2) NOT NULL DEFAULT 0.00 CHECK (original_ai_mark >= 0.00 AND original_ai_mark <= 5.00),
    final_approved_mark NUMERIC(4,2) NOT NULL DEFAULT 0.00 CHECK (final_approved_mark >= 0.00 AND final_approved_mark <= 5.00),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'NEEDS_REVIEW')),
    evaluated_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Mark Overrides Audit Table
CREATE TABLE IF NOT EXISTS public.mark_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id UUID NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
    professor_id UUID NOT NULL REFERENCES public.profiles(id),
    previous_mark NUMERIC(4,2) NOT NULL,
    new_mark NUMERIC(4,2) NOT NULL CHECK (new_mark >= 0.00 AND new_mark <= 5.00),
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performant querying
CREATE INDEX IF NOT EXISTS idx_profiles_auth_user ON public.profiles(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_usn ON public.profiles(usn);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON public.sessions(status);
CREATE INDEX IF NOT EXISTS idx_submissions_session_student ON public.submissions(session_id, student_id);
CREATE INDEX IF NOT EXISTS idx_assessments_submission ON public.assessments(submission_id);
CREATE INDEX IF NOT EXISTS idx_mark_overrides_assessment ON public.mark_overrides(assessment_id);
