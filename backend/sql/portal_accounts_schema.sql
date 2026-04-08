-- MySQL tables expected by src/repositories/studentAccountRepository.ts
-- Apply via your migration workflow or: npm run db:bootstrap-portal (from backend/)

CREATE TABLE IF NOT EXISTS portal_students (
  student_external_id VARCHAR(64) PRIMARY KEY,
  full_name VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS portal_courses (
  course_id VARCHAR(64) PRIMARY KEY,
  course_code VARCHAR(32) NOT NULL,
  title VARCHAR(255) NOT NULL,
  type ENUM('didactic', 'lab', 'clinical', 'other') NOT NULL,
  units DECIMAL(5, 2) NULL,
  hours INT NULL
);

CREATE TABLE IF NOT EXISTS portal_enrollments (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  student_external_id VARCHAR(64) NOT NULL,
  course_id VARCHAR(64) NOT NULL,
  term VARCHAR(32) NOT NULL,
  year INT NOT NULL,
  KEY idx_student_term (student_external_id, term, year),
  CONSTRAINT fk_portal_enrollment_course
    FOREIGN KEY (course_id) REFERENCES portal_courses (course_id)
);

CREATE TABLE IF NOT EXISTS portal_student_term_prefs (
  student_external_id VARCHAR(64) NOT NULL,
  term VARCHAR(32) NOT NULL,
  year INT NOT NULL,
  use_installment_plan TINYINT(1) NOT NULL DEFAULT 0,
  tuition_paid_in_full_at_reg TINYINT(1) NOT NULL DEFAULT 0,
  installment_count INT NOT NULL DEFAULT 3,
  registration_period_ends DATE NULL,
  PRIMARY KEY (student_external_id, term, year)
);

CREATE TABLE IF NOT EXISTS portal_payments (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  student_external_id VARCHAR(64) NOT NULL,
  term VARCHAR(32) NOT NULL,
  year INT NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  paid_at DATE NOT NULL,
  method VARCHAR(32) NOT NULL,
  description VARCHAR(255) NULL,
  KEY idx_pay_student_term (student_external_id, term, year)
);

CREATE TABLE IF NOT EXISTS portal_billing_adjustments (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  student_external_id VARCHAR(64) NOT NULL,
  term VARCHAR(32) NOT NULL,
  year INT NOT NULL,
  description VARCHAR(255) NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  category ENUM('tuition', 'clinical', 'fees', 'other') NOT NULL,
  adjustment_source ENUM('manual', 'system_late_fee') NOT NULL DEFAULT 'manual',
  KEY idx_adj_student_term (student_external_id, term, year)
);

CREATE TABLE IF NOT EXISTS portal_term_finance_settings (
  term VARCHAR(32) NOT NULL,
  year INT NOT NULL,
  payment_due_date DATE NULL,
  late_fee_enabled TINYINT(1) NOT NULL DEFAULT 1,
  late_fee_amount DECIMAL(12, 2) NOT NULL DEFAULT 30.00,
  updated_by VARCHAR(255) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (term, year)
);

-- Documents compliance: current requirement state per student/term + quiz/agreement attempts.
-- Requires `academic_terms` (see academic_terms_schema.sql / registration_bootstrap.sql) for FK.
CREATE TABLE IF NOT EXISTS portal_document_requirements (
  id BIGINT NOT NULL AUTO_INCREMENT,
  student_external_id VARCHAR(64) NOT NULL,
  academic_term_id VARCHAR(16) NOT NULL,
  requirement_type ENUM('ferpa','titleix','campus','copyright_release_agreement') NOT NULL,
  status ENUM('assigned','completed') NOT NULL DEFAULT 'assigned',
  score_correct INT NULL,
  total_questions INT NULL,
  is_passed TINYINT(1) NOT NULL DEFAULT 0,
  assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_at TIMESTAMP NULL DEFAULT NULL,
  last_reassigned_at TIMESTAMP NULL DEFAULT NULL,
  assigned_by VARCHAR(255) NULL,
  reassigned_by VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_portal_document_requirements_student_term_type (student_external_id, academic_term_id, requirement_type),
  KEY idx_portal_document_requirements_term_type (academic_term_id, requirement_type),
  KEY idx_portal_document_requirements_student_term (student_external_id, academic_term_id),
  CONSTRAINT fk_portal_document_requirements_student
    FOREIGN KEY (student_external_id) REFERENCES portal_students (student_external_id),
  CONSTRAINT fk_portal_document_requirements_term
    FOREIGN KEY (academic_term_id) REFERENCES academic_terms (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS portal_document_requirement_attempts (
  id BIGINT NOT NULL AUTO_INCREMENT,
  student_external_id VARCHAR(64) NOT NULL,
  academic_term_id VARCHAR(16) NOT NULL,
  requirement_type ENUM('ferpa','titleix','campus','copyright_release_agreement') NOT NULL,
  attempt_no INT NOT NULL,
  submitted_answers_json JSON NULL,
  score_correct INT NULL,
  total_questions INT NULL,
  is_passed TINYINT(1) NOT NULL DEFAULT 0,
  submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_portal_document_attempts_student_term_type_attempt (student_external_id, academic_term_id, requirement_type, attempt_no),
  KEY idx_portal_document_attempts_student_term_type (student_external_id, academic_term_id, requirement_type),
  KEY idx_portal_document_attempts_term_type (academic_term_id, requirement_type),
  CONSTRAINT fk_portal_document_attempts_student
    FOREIGN KEY (student_external_id) REFERENCES portal_students (student_external_id),
  CONSTRAINT fk_portal_document_attempts_term
    FOREIGN KEY (academic_term_id) REFERENCES academic_terms (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
