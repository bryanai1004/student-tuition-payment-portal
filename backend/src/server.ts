import { createServer } from "node:http";
import { env } from "./config/env.js";
import { app } from "./app.js";
import { closePool, testDatabaseConnection } from "./lib/db.js";
import { warmCourseSectionsColumnMetadataCache } from "./repositories/studentEnrollmentRepository.js";
import { initSocket } from "./lib/socket.js";
import {
  logOpenAiModelConfiguration,
  verifyOpenAiResponsesApi,
} from "./config/openai.js";

if (env.nodeEnv === "development") {
  console.log("DB CONFIG", {
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    database: env.db.database,
    hasPassword: Boolean(env.db.password),
  });
}

async function start(): Promise<void> {
  try {
    await testDatabaseConnection();
    await warmCourseSectionsColumnMetadataCache().catch((warmErr: unknown) => {
      const msg =
        warmErr instanceof Error ? warmErr.message : String(warmErr);
      console.warn("[server] course_sections column metadata warm skipped:", msg);
    });
  } catch (err) {
    if (env.nodeEnv === "development") {
      console.warn(
        "[server] database unreachable — starting anyway (API routes that need DB will fail). /api/health is available.",
      );
    } else {
      throw err;
    }
  }

  const server = createServer(app);
  initSocket(server);
  server.listen(env.port, () => {
    console.log(`API http://127.0.0.1:${env.port}`);
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
