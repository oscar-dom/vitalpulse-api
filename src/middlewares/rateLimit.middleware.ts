import rateLimit from "express-rate-limit";
import { sendOutcome } from "./error.middleware.js";

// Each IP may send at most 100 requests every 15 minutes; then it gets a 429.
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true, // RateLimit-* headers tell the client its remaining quota
  legacyHeaders: false,
  handler: (_req, res) => {
    sendOutcome(res, 429, [
      { code: "throttled", diagnostics: "Too many requests. Try again in 15 minutes." },
    ]);
  },
});
