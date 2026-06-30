ALTER TABLE students
  ADD COLUMN program VARCHAR(10) NOT NULL DEFAULT 'MAHM'
  AFTER requirements_id;

UPDATE students s
LEFT JOIN (
  SELECT DISTINCT TRIM(student_id) AS student_id
  FROM daim_students_info
  WHERE TRIM(student_id) <> ''
) AS legacy_daim
  ON legacy_daim.student_id = TRIM(s.id)
SET s.program = CASE
  WHEN legacy_daim.student_id IS NOT NULL THEN 'DAHM'
  ELSE 'MAHM'
END;
