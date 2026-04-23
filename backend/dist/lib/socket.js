import { Server } from "socket.io";
import { env } from "../config/env.js";
import { verifyStudentAccessToken } from "./studentAuthToken.js";
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
let io = null;
function readNonEmptyString(value) {
    if (typeof value !== "string")
        return null;
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
}
function readSocketAuth(socketAuth) {
    if (socketAuth == null || typeof socketAuth !== "object")
        return {};
    return socketAuth;
}
function toAuthorizationHeader(token) {
    return /^Bearer\s+/i.test(token) ? token : `Bearer ${token}`;
}
export function initSocket(server) {
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
        const adminRole = readNonEmptyString(auth.adminRole) ??
            readNonEmptyString(socket.handshake.headers["x-admin-role"]);
        const adminEmail = readNonEmptyString(auth.adminEmail) ??
            readNonEmptyString(socket.handshake.headers["x-admin-email"]);
        const token = readNonEmptyString(auth.token) ??
            readNonEmptyString(auth.authorization) ??
            readNonEmptyString(socket.handshake.headers.authorization);
        const studentAuth = token != null ? verifyStudentAccessToken(toAuthorizationHeader(token)) : null;
        const isAdmin = adminRole != null;
        const studentId = studentAuth?.studentId ?? null;
        if (!isAdmin && studentId == null) {
            next(new Error("Unauthorized socket connection"));
            return;
        }
        socket.data = {
            isAdmin,
            adminRole,
            adminEmail,
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
export function getIO() {
    if (io == null) {
        throw new Error("Socket.IO has not been initialized");
    }
    return io;
}
//# sourceMappingURL=socket.js.map