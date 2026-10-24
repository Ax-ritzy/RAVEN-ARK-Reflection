-- =================================================================
-- MIGRATION 004: REFERENCE CONTRIBUTOR ROLE & 5-KEYWORD ARCHITECTURE
-- Enables Reference Contributor role, 5-keyword calibration,
-- and date-based automatic session linking support.
-- =================================================================

-- 1. Expand Profiles Role Column & Update Role Check Constraint
ALTER TABLE public.profiles
    ALTER COLUMN role TYPE VARCHAR(30);

ALTER TABLE public.profiles
    DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('STUDENT', 'PROFESSOR', 'REFERENCE_CONTRIBUTOR'));

-- 2. Update Reference Keyword Sets Check Constraint (Allow 5 and legacy 15)
ALTER TABLE public.reference_keyword_sets
    DROP CONSTRAINT IF EXISTS reference_keyword_sets_keywords_check;

ALTER TABLE public.reference_keyword_sets
    ADD CONSTRAINT reference_keyword_sets_keywords_check
    CHECK (array_length(keywords, 1) IN (5, 15));

-- 3. RLS Policies for Reference Contributor (Create-Only & View Own)
DROP POLICY IF EXISTS "Reference contributors can insert reference materials" ON public.reference_materials;
CREATE POLICY "Reference contributors can insert reference materials"
    ON public.reference_materials FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.auth_user_id = auth.uid() 
            AND profiles.role IN ('PROFESSOR', 'REFERENCE_CONTRIBUTOR')
            AND profiles.status = 'ACTIVE'
        )
    );

DROP POLICY IF EXISTS "Reference contributors can view reference materials" ON public.reference_materials;
CREATE POLICY "Reference contributors can view reference materials"
    ON public.reference_materials FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.auth_user_id = auth.uid() 
            AND (
                profiles.role = 'PROFESSOR' 
                OR (profiles.role = 'REFERENCE_CONTRIBUTOR' AND (reference_materials.uploaded_by = profiles.id OR reference_materials.uploaded_by IS NULL))
                OR profiles.role = 'STUDENT'
            )
        )
    );

-- Reference Contributors can insert keyword sets for their materials
DROP POLICY IF EXISTS "Reference contributors can insert keyword sets" ON public.reference_keyword_sets;
CREATE POLICY "Reference contributors can insert keyword sets"
    ON public.reference_keyword_sets FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.auth_user_id = auth.uid() 
            AND profiles.role IN ('PROFESSOR', 'REFERENCE_CONTRIBUTOR')
            AND profiles.status = 'ACTIVE'
        )
    );

DROP POLICY IF EXISTS "Everyone can view active keyword sets" ON public.reference_keyword_sets;
CREATE POLICY "Everyone can view active keyword sets"
    ON public.reference_keyword_sets FOR SELECT
    TO authenticated
    USING (true);

-- Allow Reference Contributors to link materials to sessions created today
DROP POLICY IF EXISTS "Reference contributors can link session references" ON public.session_references;
CREATE POLICY "Reference contributors can link session references"
    ON public.session_references FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.auth_user_id = auth.uid() 
            AND profiles.role IN ('PROFESSOR', 'REFERENCE_CONTRIBUTOR')
            AND profiles.status = 'ACTIVE'
        )
    );

DROP POLICY IF EXISTS "Everyone can view session references" ON public.session_references;
CREATE POLICY "Everyone can view session references"
    ON public.session_references FOR SELECT
    TO authenticated
    USING (true);

-- Ensure Reference Contributors can view sessions to identify matching creation date
DROP POLICY IF EXISTS "Reference contributors can view sessions" ON public.sessions;
CREATE POLICY "Reference contributors can view sessions"
    ON public.sessions FOR SELECT
    TO authenticated
    USING (true);

-- 4. Storage Policies for Reference Contributors (Upload to reference-materials)
DROP POLICY IF EXISTS "Professors and contributors can upload reference materials" ON storage.objects;
DROP POLICY IF EXISTS "Professors can upload reference materials" ON storage.objects;

CREATE POLICY "Professors and contributors can upload reference materials"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'reference-materials' 
    AND public.get_user_role() IN ('PROFESSOR', 'REFERENCE_CONTRIBUTOR')
);
