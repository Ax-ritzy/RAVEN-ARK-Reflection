# Database & Security Specification

## 1. Tables & Schemas

### `profiles`
Links directly to Supabase Auth (`auth.users.id`).
- `id` (UUID, Primary Key)
- `auth_user_id` (UUID, Foreign Key to `auth.users`, UNIQUE)
- `role` (VARCHAR, 'STUDENT' or 'PROFESSOR', NOT NULL)
- `usn` (VARCHAR, UNIQUE, NULL for professors, required for students)
- `full_name` (TEXT, NOT NULL)
- `status` (VARCHAR, 'ACTIVE' or 'SUSPENDED', default 'ACTIVE')
- `created_at` (TIMESTAMPTZ, default `now()`)
- `updated_at` (TIMESTAMPTZ, default `now()`)

### `sessions`
Represents an assessment session.
- `id` (UUID, Primary Key)
- `name` (TEXT, NOT NULL)
- `status` (VARCHAR, 'OPEN' or 'CLOSED', default 'OPEN')
- `created_by` (UUID, Foreign Key to `profiles.id`, NOT NULL)
- `created_at` (TIMESTAMPTZ, default `now()`)
- `updated_at` (TIMESTAMPTZ, default `now()`)

### `reference_materials`
Lecture notes / study materials uploaded by the professor.
- `id` (UUID, Primary Key)
- `name` (TEXT, NOT NULL)
- `storage_path` (TEXT, NOT NULL)
- `extracted_text` (TEXT)
- `uploaded_by` (UUID, Foreign Key to `profiles.id`)
- `created_at` (TIMESTAMPTZ, default `now()`)

### `session_references`
Many-to-many relationship allowing multiple references per session.
- `session_id` (UUID, Foreign Key to `sessions.id` ON DELETE CASCADE)
- `reference_id` (UUID, Foreign Key to `reference_materials.id` ON DELETE CASCADE)
- PRIMARY KEY (`session_id`, `reference_id`)

### `reference_keyword_sets`
Persisted, versioned set of exactly 15 distinct keywords per reference.
- `id` (UUID, Primary Key)
- `reference_id` (UUID, Foreign Key to `reference_materials.id` ON DELETE CASCADE)
- `version` (INT, default 1)
- `keywords` (TEXT[], NOT NULL) — Constraint: `array_length(keywords, 1) = 15`
- `is_active` (BOOLEAN, default TRUE)
- `created_at` (TIMESTAMPTZ, default `now()`)

### `submissions`
Reflections uploaded by students.
- `id` (UUID, Primary Key)
- `session_id` (UUID, Foreign Key to `sessions.id`)
- `student_id` (UUID, Foreign Key to `profiles.id`)
- `storage_path` (TEXT, NOT NULL)
- `extracted_text` (TEXT, NOT NULL)
- `char_count` (INT, NOT NULL) — Constraint: `char_count <= 500`
- `status` (VARCHAR: 'SUBMITTED', 'REJECTED', 'FLAGGED')
- `submitted_at` (TIMESTAMPTZ, default `now()`)
- UNIQUE (`session_id`, `student_id`) — Strict 1 submission per student per session!

### `assessments`
Evaluation outcomes.
- `id` (UUID, Primary Key)
- `submission_id` (UUID, Foreign Key to `submissions.id`, UNIQUE)
- `selected_reference_id` (UUID, Foreign Key to `reference_materials.id`)
- `similarity_score` (FLOAT)
- `keyword_version` (INT)
- `matched_keywords` (TEXT[])
- `reference_score` (INT) — Constraint: `reference_score BETWEEN 0 AND 15`
- `original_ai_mark` (NUMERIC(4,2)) — Constraint: `BETWEEN 0.00 AND 5.00`
- `final_approved_mark` (NUMERIC(4,2)) — Constraint: `BETWEEN 0.00 AND 5.00`
- `status` (VARCHAR: 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'NEEDS_REVIEW')
- `evaluated_at` (TIMESTAMPTZ, default `now()`)

### `mark_overrides`
Full audit trail of any manual professor changes.
- `id` (UUID, Primary Key)
- `assessment_id` (UUID, Foreign Key to `assessments.id` ON DELETE CASCADE)
- `professor_id` (UUID, Foreign Key to `profiles.id`)
- `previous_mark` (NUMERIC(4,2))
- `new_mark` (NUMERIC(4,2))
- `reason` (TEXT, NOT NULL)
- `created_at` (TIMESTAMPTZ, default `now()`)

---

## 2. Row Level Security (RLS) Policies

All tables have RLS enabled: `ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;`.

### Role Helper Function
```sql
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text AS $$
  SELECT role FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

### Policy Rules
1. **Student Isolation:** Students can only read and write their own records (`auth_user_id = auth.uid()`).
2. **Professor Administration:** Users with `role = 'PROFESSOR'` have read/write access to sessions, reference materials, submissions, assessments, and mark overrides.
3. **Session Submission Guard:** Students can only insert a submission if the referenced session is `OPEN`.
4. **Service Role Access:** Privileged operations (e.g. creating auth accounts, batch grading updates) execute server-side via the Supabase `service_role` key which bypasses RLS safely.

---

## 3. Storage Security Policies

Two private buckets in Supabase Storage:
- `reference-materials`: Readable by authenticated professors and backend; writable only by professors.
- `student-submissions`: Students can upload to their own folder (`{auth.uid()}/{session_id}/*`). Students can download only their own files. Professors and backend can read all submissions.
