import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEnrollmentChangedBroadcastMessages,
  broadcastRealtimeMessages,
} from "./supabaseRealtimeBroadcast.js";

test("buildEnrollmentChangedBroadcastMessages targets admin and student topics", () => {
  const payload = {
    type: "enrollment.changed",
    studentId: "C17310",
    sectionId: 42,
    action: "registered",
    occurredAt: "2026-06-30T12:00:00.000Z",
  };

  const messages = buildEnrollmentChangedBroadcastMessages({
    studentId: " C17310 ",
    event: "enrollment.changed",
    payload,
  });

  assert.equal(messages.length, 2);
  assert.deepEqual(messages[0], {
    topic: "admin-global",
    event: "enrollment.changed",
    payload,
  });
  assert.deepEqual(messages[1], {
    topic: "student:C17310",
    event: "enrollment.changed",
    payload,
  });
});

test("broadcastRealtimeMessages posts batch payload to Supabase Realtime REST API", async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;

  globalThis.fetch = (async (input, init) => {
    capturedUrl = String(input);
    capturedInit = init;
    return new Response(null, { status: 202 });
  }) as typeof fetch;

  try {
    await broadcastRealtimeMessages(
      [
        {
          topic: "admin-global",
          event: "enrollment.changed",
          payload: { hello: "world" },
        },
      ],
      {
        url: "https://example.supabase.co/",
        apiKey: "service-role-key",
      },
    );

    assert.equal(
      capturedUrl,
      "https://example.supabase.co/realtime/v1/api/broadcast",
    );
    assert.equal(capturedInit?.method, "POST");
    assert.deepEqual(capturedInit?.headers, {
      "Content-Type": "application/json",
      apikey: "service-role-key",
    });
    assert.equal(
      capturedInit?.body,
      JSON.stringify({
        messages: [
          {
            topic: "admin-global",
            event: "enrollment.changed",
            payload: { hello: "world" },
          },
        ],
      }),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
