-- Optional cleanup for batch 05 NOT VALID constraints.
-- Review counts before DELETE; prefer archiving if audit trail matters.

\echo '=== Orphan counts before cleanup ==='
SELECT 'evaluations.marks_id' AS fk, COUNT(*) AS orphans
FROM evaluations e
LEFT JOIN marks m ON e.marks_id = m."seqNumber"
WHERE m."seqNumber" IS NULL
UNION ALL
SELECT 'evaluations_comment.marks_id', COUNT(*)
FROM evaluations_comment ec
LEFT JOIN marks m ON ec.marks_id = m."seqNumber"
WHERE m."seqNumber" IS NULL
UNION ALL
SELECT 'evaluations_clinic.clinic_id', COUNT(*)
FROM evaluations_clinic ec
LEFT JOIN clinic c ON ec.clinic_id = c."seqNumber"
WHERE c."seqNumber" IS NULL
UNION ALL
SELECT 'evaluations_clinic_comment.clinic_id', COUNT(*)
FROM evaluations_clinic_comment ecc
LEFT JOIN clinic c ON ecc.clinic_id = c."seqNumber"
WHERE c."seqNumber" IS NULL;

-- Uncomment to remove orphan evaluation rows (destructive):
--
-- DELETE FROM evaluations e
-- WHERE NOT EXISTS (SELECT 1 FROM marks m WHERE m."seqNumber" = e.marks_id);
--
-- DELETE FROM evaluations_comment ec
-- WHERE NOT EXISTS (SELECT 1 FROM marks m WHERE m."seqNumber" = ec.marks_id);
--
-- DELETE FROM evaluations_clinic ec
-- WHERE NOT EXISTS (SELECT 1 FROM clinic c WHERE c."seqNumber" = ec.clinic_id);
--
-- DELETE FROM evaluations_clinic_comment ecc
-- WHERE NOT EXISTS (SELECT 1 FROM clinic c WHERE c."seqNumber" = ecc.clinic_id);

-- After cleanup, validate constraints added in batch 05:
-- ALTER TABLE evaluations VALIDATE CONSTRAINT fk_evaluations_marks;
-- ALTER TABLE evaluations_comment VALIDATE CONSTRAINT fk_evaluations_comment_marks;
-- ALTER TABLE evaluations_clinic VALIDATE CONSTRAINT fk_evaluations_clinic_clinic;
-- ALTER TABLE evaluations_clinic_comment VALIDATE CONSTRAINT fk_evaluations_clinic_comment_clinic;
