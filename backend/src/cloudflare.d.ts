declare module "cloudflare:node" {
  import type { Server } from "node:http";

  export function httpServerHandler(
    options: { port: number } | Server,
  ): { fetch(request: Request): Promise<Response> };
}

declare module "cloudflare:workers" {
  export const env: Record<string, unknown>;
}

interface Hyperdrive {
  host: string;
  user: string;
  password: string;
  database: string;
  port: number;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}
