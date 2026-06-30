import {
  broadcastRealtimeMessages,
  buildEnrollmentChangedBroadcastMessages,
  isSupabaseRealtimeBroadcastConfigured,
} from "../lib/supabaseRealtimeBroadcast.js";
import { getIO, isSocketIoInitialized } from "../lib/socket.js";

export type EnrollmentChangedAction = "registered" | "dropped";

export type EnrollmentChangedPayload = {
  type: "enrollment.changed";
  studentId: string;
  sectionId: number | null;
  action: EnrollmentChangedAction;
  occurredAt: string;
};

const ENROLLMENT_CHANGED_EVENT = "enrollment.changed";

function emitEnrollmentChangedViaSocketIo(payload: EnrollmentChangedPayload): void {
  if (!isSocketIoInitialized()) return;

  try {
    const io = getIO();
    io.to("admin-global").emit(ENROLLMENT_CHANGED_EVENT, payload);
    io.to(`student:${payload.studentId}`).emit(ENROLLMENT_CHANGED_EVENT, payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[realtime] Socket.IO enrollment.changed emit skipped:", message);
  }
}

async function emitEnrollmentChangedViaSupabase(
  payload: EnrollmentChangedPayload,
): Promise<void> {
  if (!isSupabaseRealtimeBroadcastConfigured()) return;

  const messages = buildEnrollmentChangedBroadcastMessages({
    studentId: payload.studentId,
    event: ENROLLMENT_CHANGED_EVENT,
    payload,
  });
  await broadcastRealtimeMessages(messages);
}

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

  emitEnrollmentChangedViaSocketIo(payload);

  void emitEnrollmentChangedViaSupabase(payload).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[realtime] Supabase enrollment.changed emit skipped:", message);
  });
}
