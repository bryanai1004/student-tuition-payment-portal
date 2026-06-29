-- Batch 01: Portal domain FKs (student, term, course, section).
-- Prerequisite: 20260629210000_fk_preflight_cleanup.sql
-- Adds ~11 constraints. Existing fk_portal_enrollment_course is unchanged.

ALTER TABLE portal_enrollments
  ADD CONSTRAINT fk_portal_enrollments_student
  FOREIGN KEY (student_external_id)
  REFERENCES portal_students (student_external_id);

ALTER TABLE portal_payments
  ADD CONSTRAINT fk_portal_payments_student
  FOREIGN KEY (student_external_id)
  REFERENCES portal_students (student_external_id);

ALTER TABLE portal_student_term_prefs
  ADD CONSTRAINT fk_portal_student_term_prefs_student
  FOREIGN KEY (student_external_id)
  REFERENCES portal_students (student_external_id);

ALTER TABLE portal_billing_adjustments
  ADD CONSTRAINT fk_portal_billing_adjustments_student
  FOREIGN KEY (student_external_id)
  REFERENCES portal_students (student_external_id);

ALTER TABLE portal_document_requirements
  ADD CONSTRAINT fk_portal_document_requirements_student
  FOREIGN KEY (student_external_id)
  REFERENCES portal_students (student_external_id);

ALTER TABLE portal_document_requirement_attempts
  ADD CONSTRAINT fk_portal_document_requirement_attempts_student
  FOREIGN KEY (student_external_id)
  REFERENCES portal_students (student_external_id);

ALTER TABLE portal_document_requirements
  ADD CONSTRAINT fk_portal_document_requirements_term
  FOREIGN KEY (academic_term_id)
  REFERENCES academic_terms (id);

ALTER TABLE portal_document_requirement_attempts
  ADD CONSTRAINT fk_portal_document_requirement_attempts_term
  FOREIGN KEY (academic_term_id)
  REFERENCES academic_terms (id);

ALTER TABLE portal_enrollments
  ADD CONSTRAINT fk_portal_enrollments_course_section
  FOREIGN KEY (course_section_id)
  REFERENCES course_sections (id);

ALTER TABLE course_sections
  ADD CONSTRAINT fk_course_sections_prerequisite_course
  FOREIGN KEY (prerequisite_course_id)
  REFERENCES portal_courses (course_id);

ALTER TABLE course_feedback
  ADD CONSTRAINT fk_course_feedback_student
  FOREIGN KEY (student_id)
  REFERENCES portal_students (student_external_id);
