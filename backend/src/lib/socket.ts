import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { env } from "../config/env.js";
import { verifyAdminAccessToken, verifyAdminAccessTokenFromCookieHeader } from "./adminAuthToken.js";
import { verifyStudentAccessToken } from "./studentAuthToken.js";

type SocketAuthPayload = {
  token?: unknown;
  authorization?: unknown;
};

const REQUIRED_CORS_ORIGINS = new Set([
  "https://myamu.wanpanel.ai",
  "https://myamu-api.wanpanel.ai",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:5176",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "http://127.0.0.1:5175",
  "http://127.0.0.1:5176",
]);

for (const origin of env.corsOrigins ?? []) {
  REQUIRED_CORS_ORIGINS.add(origin);
}

let io: Server | null = null;

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function readSocketAuth(socketAuth: unknown): SocketAuthPayload {
  if (socketAuth == null || typeof socketAuth !== "object") return {};
  return socketAuth as SocketAuthPayload;
}

function toAuthorizationHeader(token: string): string {
  return /^Bearer\s+/i.test(token) ? token : `Bearer ${token}`;
}

export function initSocket(server: HttpServer): Server {
  io = new Server(server, {
    cors: {
      origin(origin, callback) {
        if (!origin || REQUIRED_CORS_ORIGINS.has(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error(`Socket CORS blocked for origin: ${origin}`));
      },
      credentials: true,
      methods: ["GET", "POST"],
    },
  });

  io.use((socket, next) => {
    const auth = readSocketAuth(socket.handshake.auth);
    const cookieHeader = socket.handshake.headers.cookie;
    const cookieStr = typeof cookieHeader === "string" ? cookieHeader : undefined;

    const adminUser =
      verifyAdminAccessTokenFromCookieHeader(cookieStr) ??
      verifyAdminAccessToken(
        typeof socket.handshake.headers.authorization === "string"
          ? socket.handshake.headers.authorization
          : undefined,
      );

    if (adminUser != null) {
      socket.data = {
        isAdmin: true,
        adminRole: adminUser.role,
        adminEmail: adminUser.email,
        studentId: null,
      };
      next();
      return;
    }

    const token =
      readNonEmptyString(auth.token) ??
      readNonEmptyString(auth.authorization) ??
      readNonEmptyString(socket.handshake.headers.authorization);
    const studentAuth =
      token != null ? verifyStudentAccessToken(toAuthorizationHeader(token)) : null;

    const studentId = studentAuth?.studentId ?? null;
    if (studentId == null) {
      next(new Error("Unauthorized socket connection"));
      return;
    }

    socket.data = {
      isAdmin: false,
      adminRole: null,
      adminEmail: null,
      studentId,
    };
    next();
  });

  io.on("connection", (socket) => {
    const isAdmin = socket.data?.isAdmin === true;
    const studentId = readNonEmptyString(socket.data?.studentId);

    if (isAdmin) {
      socket.join("admin-global");
    }
    if (studentId != null) {
      socket.join(`student:${studentId}`);
    }
  });

  return io;
}

export function isSocketIoInitialized(): boolean {
  return io != null;
}

export function getIO(): Server {
  if (io == null) {
    throw new Error("Socket.IO has not been initialized");
  }
  return io;
}
