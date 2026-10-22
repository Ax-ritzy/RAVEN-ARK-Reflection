-- Grant Professors DELETE and UPDATE authority across all tables
DROP POLICY IF EXISTS "Professors can delete sessions" ON public.sessions;
CREATE POLICY "Professors can delete sessions"
    ON public.sessions FOR DELETE
    TO authenticated
    USING (public.get_user_role() = 'PROFESSOR');

DROP POLICY IF EXISTS "Professors can delete submissions" ON public.submissions;
CREATE POLICY "Professors can delete submissions"
    ON public.submissions FOR DELETE
    TO authenticated
    USING (public.get_user_role() = 'PROFESSOR');

DROP POLICY IF EXISTS "Professors can delete assessments" ON public.assessments;
CREATE POLICY "Professors can delete assessments"
    ON public.assessments FOR DELETE
    TO authenticated
    USING (public.get_user_role() = 'PROFESSOR');

DROP POLICY IF EXISTS "Professors can delete student profiles" ON public.profiles;
CREATE POLICY "Professors can delete student profiles"
    ON public.profiles FOR DELETE
    TO authenticated
    USING (public.get_user_role() = 'PROFESSOR' AND role = 'STUDENT');

-- Foreign key update on assessments: Set ON DELETE SET NULL for selected_reference_id
ALTER TABLE public.assessments
    DROP CONSTRAINT IF EXISTS assessments_selected_reference_id_fkey,
    ADD CONSTRAINT assessments_selected_reference_id_fkey
    FOREIGN KEY (selected_reference_id)
    REFERENCES public.reference_materials(id)
    ON DELETE SET NULL;
