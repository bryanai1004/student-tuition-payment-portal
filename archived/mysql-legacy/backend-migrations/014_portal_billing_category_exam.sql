-- Add `exam` to portal billing adjustment categories (admin finance Post Charge).
ALTER TABLE portal_billing_adjustments
  MODIFY COLUMN category ENUM('tuition', 'clinical', 'fees', 'other', 'exam') NOT NULL;
