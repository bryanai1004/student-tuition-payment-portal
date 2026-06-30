import { env } from "../config/env.js";

export type RealtimeBroadcastMessage = {
  topic: string;
  event: string;
  payload: unknown;
};

function normalizeSupabaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

export function isSupabaseRealtimeBroadcastConfigured(): boolean {
  const url = env.supabase.url?.trim() ?? "";
  const key = env.supabase.serviceRoleKey?.trim() ?? "";
  return url !== "" && key !== "";
}

/**
 * Push broadcast messages via Supabase Realtime REST API.
 * Works on Cloudflare Workers (no WebSocket / Socket.IO required).
 */
export async function broadcastRealtimeMessages(
  messages: RealtimeBroadcastMessage[],
  options?: { url?: string; apiKey?: string },
): Promise<void> {
  if (messages.length === 0) return;

  const url = (options?.url ?? env.supabase.url)?.trim();
  const apiKey = (options?.apiKey ?? env.supabase.serviceRoleKey)?.trim();
  if (!url || !apiKey) {
    throw new Error(
      "Supabase Realtime broadcast is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).",
    );
  }

  const endpoint = `${normalizeSupabaseUrl(url)}/realtime/v1/api/broadcast`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey,
    },
    body: JSON.stringify({ messages }),
  });

  if (response.status !== 202 && !response.ok) {
    const detail = (await response.text().catch(() => "")).trim();
    const suffix = detail === "" ? "" : `: ${detail.slice(0, 280)}`;
    throw new Error(
      `Supabase Realtime broadcast failed (${response.status})${suffix}`,
    );
  }
}

export function buildEnrollmentChangedBroadcastMessages(params: {
  studentId: string;
  event: string;
  payload: unknown;
}): RealtimeBroadcastMessage[] {
  const studentId = params.studentId.trim();
  return [
    {
      topic: "admin-global",
      event: params.event,
      payload: params.payload,
    },
    {
      topic: `student:${studentId}`,
      event: params.event,
      payload: params.payload,
    },
  ];
}
