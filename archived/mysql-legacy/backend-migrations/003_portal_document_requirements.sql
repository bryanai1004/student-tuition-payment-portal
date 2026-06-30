-- Portal documents compliance: current requirement state + attempt history.
-- Idempotent: CREATE TABLE IF NOT EXISTS. Safe to re-run.
-- Prerequisites: portal_students, academic_terms (FK targets).

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
