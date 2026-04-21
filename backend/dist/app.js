import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { apiRouter } from "./routes/index.js";
export const app = express();
const requiredCorsOrigins = new Set([
    "https://myamu.wanpanel.ai",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
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
        callback(null, false);
    },
    credentials: true,
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-Requested-With",
        "Accept",
        "Origin",
    ],
    optionsSuccessStatus: 204,
};
app.use(cors(corsOptions));
app.options("*", cors());
app.use(express.json());
app.use("/api", apiRouter);
//# sourceMappingURL=app.js.map