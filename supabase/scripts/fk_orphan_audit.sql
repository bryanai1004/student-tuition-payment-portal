-- Foreign-key orphan audit (run before/after FK migrations).
-- Usage: psql "$DATABASE_URL" -f supabase/scripts/fk_orphan_audit.sql

\echo '=== Batch 1: Portal student refs ==='
SELECT 'portal_enrollments.student_external_id' AS fk, COUNT(*) AS orphans
FROM portal_enrollments pe
LEFT JOIN portal_students ps ON pe.student_external_id = ps.student_external_id
WHERE ps.student_external_id IS NULL
UNION ALL
SELECT 'portal_payments.student_external_id', COUNT(*)
FROM portal_payments p
LEFT JOIN portal_students ps ON p.student_external_id = ps.student_external_id
WHERE ps.student_external_id IS NULL
UNION ALL
SELECT 'portal_billing_adjustments.student_external_id', COUNT(*)
FROM portal_billing_adjustments p
LEFT JOIN portal_students ps ON p.student_external_id = ps.student_external_id
WHERE ps.student_external_id IS NULL
UNION ALL
SELECT 'portal_document_requirements.academic_term_id', COUNT(*)
FROM portal_document_requirements p
LEFT JOIN academic_terms at ON p.academic_term_id = at.id
WHERE at.id IS NULL
UNION ALL
SELECT 'portal_enrollments.course_section_id (non-null)', COUNT(*)
FROM portal_enrollments pe
LEFT JOIN course_sections cs ON pe.course_section_id = cs.id
WHERE pe.course_section_id IS NOT NULL AND cs.id IS NULL;

\echo '=== Batch 2: Clinical ==='
SELECT 'clinical_enrollments.timetable_id' AS fk, COUNT(*) AS orphans
FROM clinical_enrollments ce
LEFT JOIN clinic_timetable ct ON ce.timetable_id = ct."seqNum"
WHERE ct."seqNum" IS NULL
UNION ALL
SELECT 'clinical_booking_payment_holds.clinical_enrollment_id', COUNT(*)
FROM clinical_booking_payment_holds h
LEFT JOIN clinical_enrollments ce ON h.clinical_enrollment_id = ce.id
WHERE ce.id IS NULL
UNION ALL
SELECT 'portal_billing_adjustments.reversal_of_adjustment_id (non-null)', COUNT(*)
FROM portal_billing_adjustments p
LEFT JOIN portal_billing_adjustments p2 ON p.reversal_of_adjustment_id = p2.id
WHERE p.reversal_of_adjustment_id IS NOT NULL AND p2.id IS NULL;

\echo '=== Batch 3: Quiz / requirements ==='
SELECT 'acknowledgement_quiz_answers.quiz_question_id' AS fk, COUNT(*) AS orphans
FROM acknowledgement_quiz_answers a
LEFT JOIN acknowledgement_quiz_questions q ON a.quiz_question_id = q.id
WHERE q.id IS NULL
UNION ALL
SELECT 'students.requirements_id (non-null)', COUNT(*)
FROM students s
LEFT JOIN requirements r ON s.requirements_id = r.id
WHERE s.requirements_id IS NOT NULL AND r.id IS NULL;

\echo '=== Batch 4: Evaluations (clean subset) ==='
SELECT 'evaluations.evaluation_questions_id' AS fk, COUNT(*) AS orphans
FROM evaluations e
LEFT JOIN evaluation_questions eq ON e.evaluation_questions_id = eq.id
WHERE eq.id IS NULL
UNION ALL
SELECT 'evaluations_clinic.evaluation_questions_id', COUNT(*)
FROM evaluations_clinic ec
LEFT JOIN evaluation_questions eq ON ec.evaluation_questions_id = eq.id
WHERE eq.id IS NULL;

\echo '=== Batch 5: Evaluations (deferred / NOT VALID candidates) ==='
SELECT 'evaluations.marks_id -> marks.seqNumber' AS fk, COUNT(*) AS orphans
FROM evaluations e
LEFT JOIN marks m ON e.marks_id = m."seqNumber"
WHERE m."seqNumber" IS NULL
UNION ALL
SELECT 'evaluations_comment.marks_id', COUNT(*)
FROM evaluations_comment ec
LEFT JOIN marks m ON ec.marks_id = m."seqNumber"
WHERE m."seqNumber" IS NULL
UNION ALL
SELECT 'evaluations_clinic.clinic_id -> clinic.seqNumber', COUNT(*)
FROM evaluations_clinic ec
LEFT JOIN clinic c ON ec.clinic_id = c."seqNumber"
WHERE c."seqNumber" IS NULL
UNION ALL
SELECT 'evaluations_clinic_comment.clinic_id', COUNT(*)
FROM evaluations_clinic_comment ecc
LEFT JOIN clinic c ON ecc.clinic_id = c."seqNumber"
WHERE c."seqNumber" IS NULL;

\echo '=== Intentionally skipped (not FK columns) ==='
SELECT 'evaluations.answer is Likert 0-5, NOT evaluation_answers.id' AS note,
       MIN(answer) AS min_val, MAX(answer) AS max_val
FROM evaluations;
