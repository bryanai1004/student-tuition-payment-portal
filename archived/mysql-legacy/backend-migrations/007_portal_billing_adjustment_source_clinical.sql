-- Allow `system_clinical` for automatic clinical timetable slot booking charges.
-- Idempotent: safe to re-run; widens ENUM or refreshes VARCHAR to the same definition.

ALTER TABLE portal_billing_adjustments
  MODIFY COLUMN adjustment_source VARCHAR(64) NOT NULL DEFAULT 'manual'
  COMMENT 'manual|system_late_fee|system_clinical';
