/**
 * Clinical timetable registration: seat is reserved immediately; payment must
 * complete within this window (server UTC) or the booking is revoked.
 */
export const CLINICAL_BOOKING_PAYMENT_WINDOW_HOURS = 3;

const MS_PER_HOUR = 60 * 60 * 1000;

export function clinicalBookingPaymentDeadlineMsFromCreatedAt(
  createdAtMs: number,
): number {
  return createdAtMs + CLINICAL_BOOKING_PAYMENT_WINDOW_HOURS * MS_PER_HOUR;
}

/** `paymentDeadlineUtc` is the stored `hold_expires_at` instant (UTC). */
export function isClinicalBookingExpired(
  paymentDeadlineUtc: Date,
  nowMs: number = Date.now(),
): boolean {
  return paymentDeadlineUtc.getTime() <= nowMs;
}
