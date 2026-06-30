-- Batch 04: Evaluation question links (100% clean data).
-- NOTE: evaluations.answer / evaluations_clinic.answer are Likert scores (0–5),
--       NOT references to evaluation_answers.id — do not add FK there.

ALTER TABLE evaluations
  ADD CONSTRAINT fk_evaluations_question
  FOREIGN KEY (evaluation_questions_id)
  REFERENCES evaluation_questions (id);

ALTER TABLE evaluations_clinic
  ADD CONSTRAINT fk_evaluations_clinic_question
  FOREIGN KEY (evaluation_questions_id)
  REFERENCES evaluation_questions (id);
