import cors, { type CorsOptions } from "cors";
import express from "express";
import { env } from "./config/env.js";
import { apiRouter } from "./routes/index.js";

export const app = express();

const requiredCorsOrigins = new Set([
  "https://myamu.wanpanel.ai",
  "http://localhost:5173",
]);

for (const origin of env.corsOrigins ?? []) {
  requiredCorsOrigins.add(origin);
}

const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (!origin || requiredCorsOrigins.has(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS origin not allowed: ${origin}`));
  },
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json());
app.use("/api", apiRouter);
