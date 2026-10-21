import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { healthRouter } from "./routes/health.routes.js";

export const app = express();

// Order matters: security headers, then CORS, and only then parse the body, so
// rejected requests cost as little as possible.
app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    methods: ["GET", "POST", "PUT", "DELETE"],
  }),
);
app.use(express.json());

app.use("/health", healthRouter);
