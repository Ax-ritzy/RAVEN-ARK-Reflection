-- =================================================================
-- REFLECTION AI ASSESSMENT SYSTEM: CONSOLIDATED MASTER MIGRATION
-- Run this complete script in the Supabase Dashboard SQL Editor.
-- =================================================================

BEGIN;

-- -----------------------------------------------------------------
-- 1. TABLES & CONSTRAINTS
-- -----------------------------------------------------------------

-- 1.1 Profiles Table (Linked to Supabase auth.users)
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

-- 1.2 Sessions Table
CREATE TABLE IF NOT EXISTS public.sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
    created_by UUID NOT NULL REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1.3 Reference Materials Table
CREATE TABLE IF NOT EXISTS public.reference_materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    extracted_text TEXT,
    uploaded_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1.4 Session References Table (Many-to-Many)
CREATE TABLE IF NOT EXISTS public.session_references (
    session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    reference_id UUID NOT NULL REFERENCES public.reference_materials(id) ON DELETE CASCADE,
    PRIMARY KEY (session_id, reference_id)
);

-- 1.5 Reference Keyword Sets (Exactly 15 distinct keywords)
CREATE TABLE IF NOT EXISTS public.reference_keyword_sets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference_id UUID NOT NULL REFERENCES public.reference_materials(id) ON DELETE CASCADE,
    version INTEGER NOT NULL DEFAULT 1,
    keywords TEXT[] NOT NULL CHECK (array_length(keywords, 1) = 15),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1.6 Submissions Table (Max 500 characters, unique per student per session)
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

-- 1.7 Assessments Table (Deterministic scoring)
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

-- 1.8 Mark Overrides Table
CREATE TABLE IF NOT EXISTS public.mark_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id UUID NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
    professor_id UUID NOT NULL REFERENCES public.profiles(id),
    previous_mark NUMERIC(4,2) NOT NULL,
    new_mark NUMERIC(4,2) NOT NULL CHECK (new_mark >= 0.00 AND new_mark <= 5.00),
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_profiles_auth_user ON public.profiles(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_usn ON public.profiles(usn);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON public.sessions(status);
CREATE INDEX IF NOT EXISTS idx_submissions_session_student ON public.submissions(session_id, student_id);
CREATE INDEX IF NOT EXISTS idx_assessments_submission ON public.assessments(submission_id);
CREATE INDEX IF NOT EXISTS idx_mark_overrides_assessment ON public.mark_overrides(assessment_id);

-- -----------------------------------------------------------------
-- 2. ROW-LEVEL SECURITY & POLICIES
-- -----------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reference_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reference_keyword_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mark_overrides ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS VARCHAR AS $$
  SELECT role FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_current_profile_id()
RETURNS UUID AS $$
  SELECT id FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Profiles Policies
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (auth_user_id = auth.uid());

DROP POLICY IF EXISTS "Professors can read all profiles" ON public.profiles;
CREATE POLICY "Professors can read all profiles"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (public.get_user_role() = 'PROFESSOR');

DROP POLICY IF EXISTS "Professors can update student profiles" ON public.profiles;
CREATE POLICY "Professors can update student profiles"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (public.get_user_role() = 'PROFESSOR')
    WITH CHECK (public.get_user_role() = 'PROFESSOR');

-- Sessions Policies
DROP POLICY IF EXISTS "Authenticated users can read sessions" ON public.sessions;
CREATE POLICY "Authenticated users can read sessions"
    ON public.sessions FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Professors can insert sessions" ON public.sessions;
CREATE POLICY "Professors can insert sessions"
    ON public.sessions FOR INSERT
    TO authenticated
    WITH CHECK (public.get_user_role() = 'PROFESSOR');

DROP POLICY IF EXISTS "Professors can update sessions" ON public.sessions;
CREATE POLICY "Professors can update sessions"
    ON public.sessions FOR UPDATE
    TO authenticated
    USING (public.get_user_role() = 'PROFESSOR')
    WITH CHECK (public.get_user_role() = 'PROFESSOR');

-- Reference Materials Policies
DROP POLICY IF EXISTS "Authenticated users can read reference materials" ON public.reference_materials;
CREATE POLICY "Authenticated users can read reference materials"
    ON public.reference_materials FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Professors can manage reference materials" ON public.reference_materials;
CREATE POLICY "Professors can manage reference materials"
    ON public.reference_materials FOR ALL
    TO authenticated
    USING (public.get_user_role() = 'PROFESSOR')
    WITH CHECK (public.get_user_role() = 'PROFESSOR');

-- Session References Policies
DROP POLICY IF EXISTS "Authenticated users can read session references" ON public.session_references;
CREATE POLICY "Authenticated users can read session references"
    ON public.session_references FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Professors can manage session references" ON public.session_references;
CREATE POLICY "Professors can manage session references"
    ON public.session_references FOR ALL
    TO authenticated
    USING (public.get_user_role() = 'PROFESSOR')
    WITH CHECK (public.get_user_role() = 'PROFESSOR');

-- Reference Keyword Sets Policies
DROP POLICY IF EXISTS "Authenticated users can read reference keywords" ON public.reference_keyword_sets;
CREATE POLICY "Authenticated users can read reference keywords"
    ON public.reference_keyword_sets FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Professors can manage reference keywords" ON public.reference_keyword_sets;
CREATE POLICY "Professors can manage reference keywords"
    ON public.reference_keyword_sets FOR ALL
    TO authenticated
    USING (public.get_user_role() = 'PROFESSOR')
    WITH CHECK (public.get_user_role() = 'PROFESSOR');

-- Submissions Policies
DROP POLICY IF EXISTS "Students can read own submissions" ON public.submissions;
CREATE POLICY "Students can read own submissions"
    ON public.submissions FOR SELECT
    TO authenticated
    USING (student_id = public.get_current_profile_id());

DROP POLICY IF EXISTS "Professors can read all submissions" ON public.submissions;
CREATE POLICY "Professors can read all submissions"
    ON public.submissions FOR SELECT
    TO authenticated
    USING (public.get_user_role() = 'PROFESSOR');

DROP POLICY IF EXISTS "Students can insert own submission into open session" ON public.submissions;
CREATE POLICY "Students can insert own submission into open session"
    ON public.submissions FOR INSERT
    TO authenticated
    WITH CHECK (
        student_id = public.get_current_profile_id()
        AND EXISTS (
            SELECT 1 FROM public.sessions
            WHERE sessions.id = submissions.session_id
            AND sessions.status = 'OPEN'
        )
    );

-- Assessments Policies
DROP POLICY IF EXISTS "Students can read own completed assessments" ON public.assessments;
CREATE POLICY "Students can read own completed assessments"
    ON public.assessments FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.submissions
            WHERE submissions.id = assessments.submission_id
            AND submissions.student_id = public.get_current_profile_id()
        )
        AND status IN ('COMPLETED', 'NEEDS_REVIEW')
    );

DROP POLICY IF EXISTS "Professors can read all assessments" ON public.assessments;
CREATE POLICY "Professors can read all assessments"
    ON public.assessments FOR SELECT
    TO authenticated
    USING (public.get_user_role() = 'PROFESSOR');

DROP POLICY IF EXISTS "Professors can update assessments" ON public.assessments;
CREATE POLICY "Professors can update assessments"
    ON public.assessments FOR UPDATE
    TO authenticated
    USING (public.get_user_role() = 'PROFESSOR')
    WITH CHECK (public.get_user_role() = 'PROFESSOR');

-- Mark Overrides Policies
DROP POLICY IF EXISTS "Professors can read mark overrides" ON public.mark_overrides;
CREATE POLICY "Professors can read mark overrides"
    ON public.mark_overrides FOR SELECT
    TO authenticated
    USING (public.get_user_role() = 'PROFESSOR');

DROP POLICY IF EXISTS "Professors can insert mark overrides" ON public.mark_overrides;
CREATE POLICY "Professors can insert mark overrides"
    ON public.mark_overrides FOR INSERT
    TO authenticated
    WITH CHECK (
        public.get_user_role() = 'PROFESSOR'
        AND professor_id = public.get_current_profile_id()
    );

-- -----------------------------------------------------------------
-- 3. STORAGE BUCKETS & POLICIES
-- -----------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('reference-materials', 'reference-materials', false),
  ('student-submissions', 'student-submissions', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Professors can upload reference materials" ON storage.objects;
CREATE POLICY "Professors can upload reference materials"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'reference-materials' 
    AND public.get_user_role() = 'PROFESSOR'
);

DROP POLICY IF EXISTS "Authenticated users can read reference materials" ON storage.objects;
CREATE POLICY "Authenticated users can read reference materials"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'reference-materials');

DROP POLICY IF EXISTS "Students can upload their own submission files" ON storage.objects;
CREATE POLICY "Students can upload their own submission files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'student-submissions'
    AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Students can read their own submission files" ON storage.objects;
CREATE POLICY "Students can read their own submission files"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'student-submissions'
    AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Professors can read all submission files" ON storage.objects;
CREATE POLICY "Professors can read all submission files"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'student-submissions'
    AND public.get_user_role() = 'PROFESSOR'
);

COMMIT;
