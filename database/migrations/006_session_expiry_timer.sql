-- =================================================================
-- MIGRATION 006: SESSION EXPIRY TIMER & AUTO-SUBMIT
-- Authoritative Schema update for time-bounded reflection sessions
-- =================================================================

-- 1. Add nullable expires_at column to public.sessions
ALTER TABLE public.sessions 
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Create index for fast status and expiration filtering
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON public.sessions(expires_at);

-- 3. Document column purpose
COMMENT ON COLUMN public.sessions.expires_at IS 'Optional expiration timestamp for the session. When set, students have until this time to submit before automatic closure and draft auto-submission.';
