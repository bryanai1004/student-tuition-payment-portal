-- Batch 03: Quiz / simulation lookup tables and graduation requirements.
-- All rows validated clean as of 2026-06-29.

ALTER TABLE acknowledgement_quiz_answers
  ADD CONSTRAINT fk_ack_quiz_answers_question
  FOREIGN KEY (quiz_question_id)
  REFERENCES acknowledgement_quiz_questions (id);

ALTER TABLE simulation_exam_answers
  ADD CONSTRAINT fk_simulation_exam_answers_question
  FOREIGN KEY (question_id)
  REFERENCES simulation_exam_questions (id);

ALTER TABLE students
  ADD CONSTRAINT fk_students_requirements
  FOREIGN KEY (requirements_id)
  REFERENCES requirements (id);
