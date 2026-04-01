-- MySQL tables expected by src/repositories/studentAccountRepository.ts
-- Apply via your migration workflow.

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
  KEY idx_adj_student_term (student_external_id, term, year)
);
