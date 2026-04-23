-- Align existing active clinical booking payment deadlines with the 3-hour rule:
-- set hold_expires_at = created_at + 3 hours when the row still used a longer window.
-- Idempotent: rows already at <= 3 hours from created_at are unchanged.

UPDATE clinical_booking_payment_holds h
INNER JOIN clinical_enrollments ce
   ON ce.id = h.clinical_enrollment_id
SET h.hold_expires_at = TIMESTAMPADD(HOUR, 3, h.created_at)
WHERE h.status = 'active'
  AND LOWER(TRIM(ce.status)) = 'enrolled'
  AND h.hold_expires_at > TIMESTAMPADD(HOUR, 3, h.created_at);
