import type { PoolConnection } from "mysql2/promise";
export type ClinicalBookingPaymentHoldStatus = "active" | "satisfied_paid" | "expired_auto_dropped" | "cancelled_manual_drop" | "cancelled_enrollment_inactive" | "cancelled_superseded";
export type ClinicalBookingPaymentHoldRow = {
    id: number;
    clinicalEnrollmentId: number;
    studentId: string;
    billingAdjustmentId: number;
    term: string;
    year: number;
    chargeAmount: number;
    balanceBeforeCharge: number;
    holdExpiresAt: Date;
    status: ClinicalBookingPaymentHoldStatus;
};
export declare function clinicalBookingPaymentHoldsTableExists(): Promise<boolean>;
export declare function insertClinicalBookingPaymentHold(params: {
    clinicalEnrollmentId: number;
    studentId: string;
    billingAdjustmentId: number;
    term: string;
    year: number;
    chargeAmount: number;
    balanceBeforeCharge: number;
}): Promise<number>;
export declare function cancelActiveClinicalBookingPaymentHoldsForEnrollment(conn: PoolConnection, clinicalEnrollmentId: number, reason: "manual_drop" | "superseded"): Promise<void>;
export declare function cancelActiveClinicalBookingPaymentHoldsForEnrollmentPool(clinicalEnrollmentId: number, reason: "manual_drop" | "superseded"): Promise<void>;
export declare function voidSystemClinicalChargesForEnrollmentPool(clinicalEnrollmentId: number): Promise<number>;
export declare function voidSystemClinicalChargesForEnrollmentInConn(conn: PoolConnection, clinicalEnrollmentId: number): Promise<number>;
/** Voids a single system clinical booking charge row (used when a hold expires). */
export declare function voidSystemClinicalBillingAdjustmentByIdInConn(conn: PoolConnection, billingAdjustmentId: number): Promise<boolean>;
export declare function listDueActiveClinicalBookingPaymentHoldIds(limit: number): Promise<number[]>;
export declare function lockClinicalBookingPaymentHoldById(conn: PoolConnection, holdId: number): Promise<ClinicalBookingPaymentHoldRow | null>;
export declare function updateClinicalBookingPaymentHoldStatus(conn: PoolConnection, holdId: number, status: ClinicalBookingPaymentHoldStatus, fields: {
    satisfiedAt?: Date | null;
    autoDroppedAt?: Date | null;
}): Promise<void>;
export declare function markClinicalBookingPaymentHoldSatisfiedOutsideTxn(holdId: number): Promise<void>;
export declare function listActiveClinicalBookingPaymentHoldsForStudent(studentId: string): Promise<{
    id: number;
    balanceBeforeCharge: number;
    chargeAmount: number;
    term: string;
    year: number;
}[]>;
//# sourceMappingURL=clinicalBookingPaymentHoldRepository.d.ts.map