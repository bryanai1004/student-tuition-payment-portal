export type EnrollmentChangedAction = "registered" | "dropped";
export type EnrollmentChangedPayload = {
    type: "enrollment.changed";
    studentId: string;
    sectionId: number | null;
    action: EnrollmentChangedAction;
    occurredAt: string;
};
export declare function emitEnrollmentChanged(params: {
    studentId: string;
    sectionId: number | null;
    action: EnrollmentChangedAction;
}): void;
//# sourceMappingURL=realtimeEventBus.d.ts.map