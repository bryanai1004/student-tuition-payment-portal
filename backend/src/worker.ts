/**
 * Cloudflare Workers production entry.
 * Runs the existing Express app via httpServerHandler (Node.js compat).
 *
 * @see https://developers.cloudflare.com/workers/tutorials/deploy-an-express-app/
 */
import { createServer } from "node:http";
import { httpServerHandler } from "cloudflare:node";
import { configureDbFromHyperdrive } from "./lib/db.js";
import { app } from "./app.js";
import {
  logOpenAiModelConfiguration,
  verifyOpenAiResponsesApi,
} from "./config/openai.js";

/** Routing key for httpServerHandler — not a real network port on Workers. */
const WORKER_HTTP_PORT = 8080;

type WorkerBindings = {
  HYPERDRIVE: Hyperdrive;
};

let workerInitialized = false;

const server = createServer(app);
server.listen(WORKER_HTTP_PORT);

const expressHandler = httpServerHandler({ port: WORKER_HTTP_PORT });

async function ensureWorkerInitialized(
  env: WorkerBindings,
  ctx: ExecutionContext,
): Promise<void> {
  if (workerInitialized) return;
  configureDbFromHyperdrive(env.HYPERDRIVE);
  workerInitialized = true;

  logOpenAiModelConfiguration();
  ctx.waitUntil(
    Promise.all([
      import("./repositories/studentEnrollmentRepository.js")
        .then((m) => m.warmCourseSectionsColumnMetadataCache())
        .catch((warmErr: unknown) => {
          const msg =
            warmErr instanceof Error ? warmErr.message : String(warmErr);
          console.warn(
            "[worker] course_sections column metadata warm skipped:",
            msg,
          );
        }),
      verifyOpenAiResponsesApi().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.warn("[openai] verification failed:", message);
      }),
    ]),
  );
}

export default {
  async fetch(
    request: Request,
    env: WorkerBindings,
    ctx: ExecutionContext,
  ): Promise<Response> {
    await ensureWorkerInitialized(env, ctx);
    return expressHandler.fetch(request);
  },
};
