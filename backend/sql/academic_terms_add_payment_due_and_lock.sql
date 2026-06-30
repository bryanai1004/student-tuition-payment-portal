-- Prefer supabase/migrations/ — see docs/database-migrations.md.
-- Legacy reference: archived/mysql-legacy/backend-migrations/001_academic_terms_payment_policy.sql
--
-- Extends `academic_terms` for payment DDL and registration lock (Admin Academic Terms UI).
-- For databases missing these columns (older `academic_terms_schema.sql`).
--
-- A) Fresh old schema (no `payment_due_date`, no `lock_registration_if_overdue`): run block A only.
-- B) If `payment_due_date` already exists: skip block A; run block B only.

-- A) Add both columns in one statement (fails if either column already exists)
ALTER TABLE academic_terms
  ADD COLUMN payment_due_date DATE NULL COMMENT 'Portal payment due date (DDL) for this term' AFTER registration_close,
  ADD COLUMN lock_registration_if_overdue TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'When 1, block registration for students past payment DDL' AFTER payment_due_date;

-- B) Lock column only (when `payment_due_date` was added separately earlier)
-- ALTER TABLE academic_terms
--   ADD COLUMN lock_registration_if_overdue TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'When 1, block registration for students past payment DDL' AFTER payment_due_date;
