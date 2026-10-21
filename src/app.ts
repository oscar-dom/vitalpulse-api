import cors from "cors";
import express from "express";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { env } from "./config/env.js";
import openapiSpec from "./docs/openapi.json" with { type: "json" };
import { ACCEPTED_BODY_TYPES, requireJsonBody } from "./middlewares/content-type.middleware.js";
import { globalErrorHandler, notFoundHandler } from "./middlewares/error.middleware.js";
import { globalLimiter } from "./middlewares/rateLimit.middleware.js";
import { authRouter } from "./routes/auth.routes.js";
import { fhirRouter } from "./routes/fhir.routes.js";
import { healthRouter } from "./routes/health.routes.js";

export const app = express();

// Order matters: security headers, then CORS, then the rate limit, and only then
// parse the body, so rejected requests cost as little as possible.
app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    methods: ["GET", "POST", "PUT", "DELETE"],
    // Clients read these to follow a created resource and to update it safely.
    exposedHeaders: ["Location", "ETag", "Last-Modified"],
  }),
);
app.use(globalLimiter);
app.use(requireJsonBody);
app.use(express.json({ type: ACCEPTED_BODY_TYPES }));

// API documentation: interactive Swagger UI, plus the raw spec for other tools.
app.get("/docs/openapi.json", (_req, res) => {
  res.json(openapiSpec);
});
app.use("/docs", swaggerUi.serve, swaggerUi.setup(openapiSpec));

app.use("/health", healthRouter);
app.use("/auth", authRouter);
app.use("/fhir", fhirRouter);

// Always last, in this order.
app.use(notFoundHandler);
app.use(globalErrorHandler);
