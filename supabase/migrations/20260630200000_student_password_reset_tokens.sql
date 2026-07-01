-- One-time tokens for student password reset links (verified login email required).

CREATE TABLE IF NOT EXISTS student_password_reset_tokens (
  id BIGSERIAL PRIMARY KEY,
  student_id VARCHAR(64) NOT NULL,
  token_hash VARCHAR(128) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_password_reset_tokens_hash
  ON student_password_reset_tokens (token_hash)
  WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_student_password_reset_tokens_student_recent
  ON student_password_reset_tokens (student_id, created_at DESC);

ALTER TABLE public.student_password_reset_tokens ENABLE ROW LEVEL SECURITY;
