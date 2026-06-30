-- Verified login email for student OTP sign-in and password reset (Phase 1).

CREATE TABLE IF NOT EXISTS student_login_emails (
  student_id VARCHAR(64) PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_student_login_emails_email UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS idx_student_login_emails_email_lower
  ON student_login_emails (LOWER(email));

CREATE TABLE IF NOT EXISTS student_email_otp_challenges (
  id BIGSERIAL PRIMARY KEY,
  student_id VARCHAR(64) NOT NULL,
  email VARCHAR(255) NOT NULL,
  code_hash VARCHAR(128) NOT NULL,
  purpose VARCHAR(32) NOT NULL DEFAULT 'verify',
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  consumed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_email_otp_challenges_lookup
  ON student_email_otp_challenges (student_id, email, purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_student_email_otp_challenges_student_recent
  ON student_email_otp_challenges (student_id, created_at DESC);

ALTER TABLE public.student_login_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_email_otp_challenges ENABLE ROW LEVEL SECURITY;
