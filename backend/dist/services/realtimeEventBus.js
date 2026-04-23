import { getIO } from "../lib/socket.js";
export function emitEnrollmentChanged(params) {
    const studentId = params.studentId.trim();
    if (studentId === "")
        return;
    const payload = {
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
    }
    catch (error) {
        console.warn("[realtime] enrollment.changed emit skipped:", error);
    }
}
//# sourceMappingURL=realtimeEventBus.js.map