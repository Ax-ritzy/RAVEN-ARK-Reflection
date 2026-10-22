-- =================================================================
-- MIGRATION 003: STORAGE BUCKETS & ACCESS POLICIES
-- Configure Supabase Storage for Reference Materials and Submissions.
-- =================================================================

-- 1. Create Private Buckets
INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('reference-materials', 'reference-materials', false),
  ('student-submissions', 'student-submissions', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Storage Policies for 'reference-materials'
CREATE POLICY "Professors can upload reference materials"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'reference-materials' 
    AND public.get_user_role() = 'PROFESSOR'
);

CREATE POLICY "Authenticated users can read reference materials"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'reference-materials');

-- 3. Storage Policies for 'student-submissions'
CREATE POLICY "Students can upload their own submission files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'student-submissions'
    AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Students can read their own submission files"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'student-submissions'
    AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Professors can read all submission files"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'student-submissions'
    AND public.get_user_role() = 'PROFESSOR'
);
