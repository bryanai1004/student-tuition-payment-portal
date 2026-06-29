import { createServer } from "node:http";
import { env } from "./config/env.js";
import { app } from "./app.js";
import { closePool, testDatabaseConnection } from "./lib/db.js";
import { warmCourseSectionsColumnMetadataCache } from "./repositories/studentEnrollmentRepository.js";
import { initSocket } from "./lib/socket.js";
import {
  isSupabaseConfigured,
  supabaseProjectHost,
  testSupabaseConnection,
} from "./lib/supabaseAdmin.js";
import {
  logOpenAiModelConfiguration,
  verifyOpenAiResponsesApi,
} from "./config/openai.js";

if (env.nodeEnv === "development") {
  console.log("SUPABASE CONFIG", {
    host: supabaseProjectHost() ?? "(not set)",
    database: "postgres",
    storageBucket: env.supabase.storageBucket,
    hasServiceRoleKey: Boolean(env.supabase.serviceRoleKey),
    hasAnonKey: Boolean(env.supabase.anonKey),
  });
}

async function start(): Promise<void> {
  const useSupabaseDb = isSupabaseConfigured();
  let dbReady = false;
  try {
    if (useSupabaseDb) {
      await testSupabaseConnection();
      if (env.nodeEnv === "development") {
        console.log("[supabase] API connection verified");
      }
    }
    await testDatabaseConnection();
    if (env.nodeEnv === "development") {
      console.log(
        useSupabaseDb
          ? "[supabase] Postgres pool connection verified"
          : "[db] connection verified",
      );
    }
    dbReady = true;
    await warmCourseSectionsColumnMetadataCache().catch((warmErr: unknown) => {
      const msg =
        warmErr instanceof Error ? warmErr.message : String(warmErr);
      console.warn(
        "[server] course_sections column metadata warm skipped:",
        msg,
      );
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (env.nodeEnv === "development") {
      console.warn(
        `[server] database unreachable — starting anyway (API routes that need DB will fail). ${message} /api/health is available.`,
      );
    } else {
      throw err;
    }
  }

  const server = createServer(app);
  initSocket(server);
  server.listen(env.port, () => {
    console.log(`API http://127.0.0.1:${env.port}`);
    if (useSupabaseDb && dbReady) {
      console.log(
        `Database: Supabase (PostgreSQL) — connected — ${supabaseProjectHost() ?? env.supabase.url}`,
      );
      console.log(
        `Schemas: https://supabase.com/dashboard/project/okeiftbrwhfehflpxogs/database/schemas`,
      );
    } else if (dbReady) {
      console.log(`Database: PostgreSQL — ${env.db.host}`);
    }
    console.log(`Frontend (dev): http://127.0.0.1:5175`);
    logOpenAiModelConfiguration();
    void verifyOpenAiResponsesApi().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("[openai] verification failed:", message);
    });
    console.log(
      `Verify demo JSON: http://127.0.0.1:${env.port}/api/demo/account?term=Fall&year=2026`,
    );
  });

  async function shutdown(signal: string): Promise<void> {
    console.log(`[server] ${signal} received, closing…`);
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    await closePool();
  }

  for (const sig of ["SIGTERM", "SIGINT"] as const) {
    process.on(sig, () => {
      shutdown(sig).then(
        () => process.exit(0),
        (err) => {
          console.error(err);
          process.exit(1);
        },
      );
    });
  }
}

start().catch((err: unknown) => {
  const e = err as NodeJS.ErrnoException & Error;
  console.error("[server] failed to start (check DB env vars and network):", {
    message: e.message,
    code: e.code,
    errno: e.errno,
    syscall: e.syscall,
  });
  if (e.stack) console.error(e.stack);
  process.exit(1);
});
