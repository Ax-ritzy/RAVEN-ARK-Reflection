-- =================================================================
-- MIGRATION 002: ROW LEVEL SECURITY (RLS) POLICIES
-- Strict Isolation for Students and Authoritative Access for Professors.
-- =================================================================

-- 1. Enable RLS on all exposed tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reference_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reference_keyword_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mark_overrides ENABLE ROW LEVEL SECURITY;

-- 2. Helper Functions (Security Definer)
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS VARCHAR AS $$
  SELECT role FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_current_profile_id()
RETURNS UUID AS $$
  SELECT id FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 3. Profiles Policies
CREATE POLICY "Users can read own profile"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (auth_user_id = auth.uid());

CREATE POLICY "Professors can read all profiles"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (public.get_user_role() = 'PROFESSOR');

CREATE POLICY "Professors can update student profiles"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (public.get_user_role() = 'PROFESSOR')
    WITH CHECK (public.get_user_role() = 'PROFESSOR');

-- 4. Sessions Policies
CREATE POLICY "Authenticated users can read sessions"
    ON public.sessions FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Professors can insert sessions"
    ON public.sessions FOR INSERT
    TO authenticated
    WITH CHECK (public.get_user_role() = 'PROFESSOR');

CREATE POLICY "Professors can update sessions"
    ON public.sessions FOR UPDATE
    TO authenticated
    USING (public.get_user_role() = 'PROFESSOR')
    WITH CHECK (public.get_user_role() = 'PROFESSOR');

-- 5. Reference Materials Policies
CREATE POLICY "Authenticated users can read reference materials"
    ON public.reference_materials FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Professors can manage reference materials"
    ON public.reference_materials FOR ALL
    TO authenticated
    USING (public.get_user_role() = 'PROFESSOR')
    WITH CHECK (public.get_user_role() = 'PROFESSOR');

-- 6. Session References Policies
CREATE POLICY "Authenticated users can read session references"
    ON public.session_references FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Professors can manage session references"
    ON public.session_references FOR ALL
    TO authenticated
    USING (public.get_user_role() = 'PROFESSOR')
    WITH CHECK (public.get_user_role() = 'PROFESSOR');

-- 7. Reference Keyword Sets Policies
CREATE POLICY "Authenticated users can read reference keywords"
    ON public.reference_keyword_sets FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Professors can manage reference keywords"
    ON public.reference_keyword_sets FOR ALL
    TO authenticated
    USING (public.get_user_role() = 'PROFESSOR')
    WITH CHECK (public.get_user_role() = 'PROFESSOR');

-- 8. Submissions Policies
CREATE POLICY "Students can read own submissions"
    ON public.submissions FOR SELECT
    TO authenticated
    USING (student_id = public.get_current_profile_id());

CREATE POLICY "Professors can read all submissions"
    ON public.submissions FOR SELECT
    TO authenticated
    USING (public.get_user_role() = 'PROFESSOR');

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

-- 9. Assessments Policies
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

CREATE POLICY "Professors can read all assessments"
    ON public.assessments FOR SELECT
    TO authenticated
    USING (public.get_user_role() = 'PROFESSOR');

CREATE POLICY "Professors can update assessments"
    ON public.assessments FOR UPDATE
    TO authenticated
    USING (public.get_user_role() = 'PROFESSOR')
    WITH CHECK (public.get_user_role() = 'PROFESSOR');

-- 10. Mark Overrides Policies
CREATE POLICY "Professors can read mark overrides"
    ON public.mark_overrides FOR SELECT
    TO authenticated
    USING (public.get_user_role() = 'PROFESSOR');

CREATE POLICY "Professors can insert mark overrides"
    ON public.mark_overrides FOR INSERT
    TO authenticated
    WITH CHECK (
        public.get_user_role() = 'PROFESSOR'
        AND professor_id = public.get_current_profile_id()
    );
