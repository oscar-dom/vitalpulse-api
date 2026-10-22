import pino from "pino";
import { env } from "./env.js";

// Structured JSON logs. In development pino-pretty makes them readable in the console;
// elsewhere they stay as raw JSON lines for a log collector to read.
export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: "vitalpulse-api", env: env.NODE_ENV },
  transport:
    env.NODE_ENV === "development"
      ? {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:standard", ignore: "pid,hostname" },
        }
      : undefined,
});
