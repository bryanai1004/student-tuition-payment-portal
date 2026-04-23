import { getIO } from "../lib/socket.js";

export type EnrollmentChangedAction = "registered" | "dropped";

export type EnrollmentChangedPayload = {
  type: "enrollment.changed";
  studentId: string;
  sectionId: number | null;
  action: EnrollmentChangedAction;
  occurredAt: string;
};

export function emitEnrollmentChanged(params: {
  studentId: string;
  sectionId: number | null;
  action: EnrollmentChangedAction;
}): void {
  const studentId = params.studentId.trim();
  if (studentId === "") return;

  const payload: EnrollmentChangedPayload = {
    type: "enrollment.changed",
    studentId,
    sectionId: params.sectionId,
    action: params.action,
    occurredAt: new Date().toISOString(),
  };

  try {
    const io = getIO();
    io.to("admin-global").emit("enrollment.changed", payload);
    io.to(`student:${studentId}`).emit("enrollment.changed", payload);
  } catch (error) {
    console.warn("[realtime] enrollment.changed emit skipped:", error);
  }
}
