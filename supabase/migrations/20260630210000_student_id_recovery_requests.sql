-- Rate-limit log for forgot-student-id emails (verified login email required).

CREATE TABLE IF NOT EXISTS student_id_recovery_requests (
  id BIGSERIAL PRIMARY KEY,
  student_id VARCHAR(64) NOT NULL,
  email VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_id_recovery_requests_student_recent
  ON student_id_recovery_requests (student_id, created_at DESC);

ALTER TABLE public.student_id_recovery_requests ENABLE ROW LEVEL SECURITY;
