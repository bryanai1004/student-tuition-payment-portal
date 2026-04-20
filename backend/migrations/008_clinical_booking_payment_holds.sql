-- Phase 3: 12-hour payment hold for clinical slot booking charges only.
-- Idempotent: safe to re-run.

SET @db := DATABASE();

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'portal_billing_adjustments'
    AND COLUMN_NAME = 'clinical_enrollment_id'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE portal_billing_adjustments
     ADD COLUMN clinical_enrollment_id INT NULL
       COMMENT ''clinical_enrollments.id when this row is a system clinical slot booking charge''
       AFTER adjustment_source',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'portal_billing_adjustments'
    AND INDEX_NAME = 'idx_portal_billing_adj_clinical_enrollment'
);
SET @sql2 := IF(@idx_exists = 0,
  'CREATE INDEX idx_portal_billing_adj_clinical_enrollment ON portal_billing_adjustments (clinical_enrollment_id)',
  'SELECT 1'
);
PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

CREATE TABLE IF NOT EXISTS clinical_booking_payment_holds (
  id BIGINT NOT NULL AUTO_INCREMENT,
  clinical_enrollment_id INT NOT NULL,
  student_id VARCHAR(20) NOT NULL,
  billing_adjustment_id BIGINT NOT NULL,
  term VARCHAR(32) NOT NULL,
  year INT NOT NULL,
  charge_amount DECIMAL(12, 2) NOT NULL,
  balance_before_charge DECIMAL(12, 2) NOT NULL,
  hold_expires_at DATETIME NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  satisfied_at DATETIME NULL,
  auto_dropped_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cbph_status_expires (status, hold_expires_at),
  KEY idx_cbph_enrollment (clinical_enrollment_id),
  KEY idx_cbph_student (student_id),
  KEY idx_cbph_adjustment (billing_adjustment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
