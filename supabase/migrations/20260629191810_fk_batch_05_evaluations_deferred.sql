-- Batch 05: Legacy evaluation / clinic links with historical orphan rows.
-- Uses NOT VALID so Schema Visualizer shows relationships immediately;
-- new inserts/updates are enforced. Run VALIDATE after orphan cleanup.
--
-- Orphan counts (2026-06-29):
--   evaluations.marks_id              3,744 / 309,185
--   evaluations_comment.marks_id        212
--   evaluations_clinic.clinic_id        240
--   evaluations_clinic_comment.clinic_id 24

ALTER TABLE evaluations
  ADD CONSTRAINT fk_evaluations_marks
  FOREIGN KEY (marks_id)
  REFERENCES marks ("seqNumber")
  NOT VALID;

ALTER TABLE evaluations_comment
  ADD CONSTRAINT fk_evaluations_comment_marks
  FOREIGN KEY (marks_id)
  REFERENCES marks ("seqNumber")
  NOT VALID;

ALTER TABLE evaluations_clinic
  ADD CONSTRAINT fk_evaluations_clinic_clinic
  FOREIGN KEY (clinic_id)
  REFERENCES clinic ("seqNumber")
  NOT VALID;

ALTER TABLE evaluations_clinic_comment
  ADD CONSTRAINT fk_evaluations_clinic_comment_clinic
  FOREIGN KEY (clinic_id)
  REFERENCES clinic ("seqNumber")
  NOT VALID;

-- After deleting/archiving orphan rows, validate each constraint:
--   ALTER TABLE evaluations VALIDATE CONSTRAINT fk_evaluations_marks;
--   ALTER TABLE evaluations_comment VALIDATE CONSTRAINT fk_evaluations_comment_marks;
--   ALTER TABLE evaluations_clinic VALIDATE CONSTRAINT fk_evaluations_clinic_clinic;
--   ALTER TABLE evaluations_clinic_comment VALIDATE CONSTRAINT fk_evaluations_clinic_comment_clinic;
