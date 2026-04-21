import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { apiRouter } from "./routes/index.js";
export const app = express();
const requiredCorsOrigins = new Set([
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
    requiredCorsOrigins.add(origin);
}
const corsOptions = {
    origin(origin, callback) {
        if (!origin || requiredCorsOrigins.has(origin)) {
            callback(null, true);
            return;
        }
        callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
};
app.use(cors(corsOptions));
app.options("*", cors());
app.use(express.json());
app.use("/api", apiRouter);
//# sourceMappingURL=app.js.map