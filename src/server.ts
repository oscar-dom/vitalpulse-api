import { env } from "./config/env.js";
import { connectDB, disconnectDB } from "./config/database.js";
import { app } from "./app.js";
import { logger } from "./config/logger.js";

const start = async (): Promise<void> => {
  try {
    await connectDB(env.MONGODB_URI);
  } catch (error) {
    logger.fatal({ err: error }, "Could not connect to MongoDB");
    process.exit(1);
  }

  const server = app.listen(env.PORT, () => {
    logger.info(`VitalPulse API listening on http://localhost:${env.PORT}`);
    logger.info(`FHIR endpoint: ${env.FHIR_BASE_URL}`);
  });

  const shutdown = (signal: string): void => {
    logger.info(`${signal} received, shutting down`);
    server.close(() => {
      void disconnectDB().then(() => process.exit(0));
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
};

void start();
