-- Batch 02: Clinical scheduling, enrollments, and billing cross-links.
-- Prerequisite: 20260629210000_fk_preflight_cleanup.sql

ALTER TABLE clinical_enrollments
  ADD CONSTRAINT fk_clinical_enrollments_student
  FOREIGN KEY (student_id)
  REFERENCES portal_students (student_external_id);

ALTER TABLE clinical_enrollments
  ADD CONSTRAINT fk_clinical_enrollments_timetable
  FOREIGN KEY (timetable_id)
  REFERENCES clinic_timetable ("seqNum");

ALTER TABLE clinical_requests
  ADD CONSTRAINT fk_clinical_requests_student
  FOREIGN KEY (student_id)
  REFERENCES portal_students (student_external_id);

ALTER TABLE clinical_requests
  ADD CONSTRAINT fk_clinical_requests_timetable
  FOREIGN KEY (timetable_id)
  REFERENCES clinic_timetable ("seqNum");

ALTER TABLE clinical_assignments
  ADD CONSTRAINT fk_clinical_assignments_timetable
  FOREIGN KEY (timetable_id)
  REFERENCES clinic_timetable ("seqNum");

ALTER TABLE clinical_booking_payment_holds
  ADD CONSTRAINT fk_clinical_booking_payment_holds_enrollment
  FOREIGN KEY (clinical_enrollment_id)
  REFERENCES clinical_enrollments (id);

ALTER TABLE clinical_booking_payment_holds
  ADD CONSTRAINT fk_clinical_booking_payment_holds_adjustment
  FOREIGN KEY (billing_adjustment_id)
  REFERENCES portal_billing_adjustments (id);

ALTER TABLE portal_billing_adjustments
  ADD CONSTRAINT fk_portal_billing_adjustments_clinical_enrollment
  FOREIGN KEY (clinical_enrollment_id)
  REFERENCES clinical_enrollments (id);

ALTER TABLE portal_billing_adjustments
  ADD CONSTRAINT fk_portal_billing_adjustments_reversal
  FOREIGN KEY (reversal_of_adjustment_id)
  REFERENCES portal_billing_adjustments (id);

ALTER TABLE clinical_exam_requests
  ADD CONSTRAINT fk_clinical_exam_requests_billing_adjustment
  FOREIGN KEY (billing_adjustment_id)
  REFERENCES portal_billing_adjustments (id);
