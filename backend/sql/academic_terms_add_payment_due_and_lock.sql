-- Extends `academic_terms` for payment DDL and registration lock (Admin Academic Terms UI).
-- Run against existing databases that were created from an older `academic_terms_schema.sql`.
--
-- If `payment_due_date` already exists (e.g. added manually for finance), skip the first
-- statement or comment it out; run only what your instance needs.
--
-- MySQL / MariaDB (InnoDB):

ALTER TABLE academic_terms
  ADD COLUMN payment_due_date DATE NULL COMMENT 'Portal payment due date (DDL) for this term' AFTER registration_close;

ALTER TABLE academic_terms
  ADD COLUMN lock_registration_if_overdue TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'When 1, block registration for students past payment DDL' AFTER payment_due_date;
