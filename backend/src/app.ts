import cors from "cors";
import express from "express";
import { apiRouter } from "./routes/index.js";

export const app = express();

app.use(cors({ origin: true }));
app.use(express.json());
app.use("/api", apiRouter);
