// Creates the first admin from ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD in .env.
// Run it once after setting up the database: npm run seed:admin
import { z } from "zod";
import { env } from "./config/env.js";
import { connectDB, disconnectDB } from "./config/database.js";
import { logger } from "./config/logger.js";
import { registerSchema } from "./schemas/auth.schema.js";
import { ensureAdmin } from "./services/admin.service.js";

const seed = async (): Promise<void> => {
  // Same rules as a normal sign-up, so the admin password is just as strong.
  const parsed = registerSchema.safeParse({
    name: process.env.ADMIN_NAME ?? "Administrator",
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  });

  if (!parsed.success) {
    logger.fatal(
      `Invalid admin settings (ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD):\n${z.prettifyError(parsed.error)}`,
    );
    process.exit(1);
  }

  await connectDB(env.MONGODB_URI);
  try {
    const { created, user } = await ensureAdmin(parsed.data);
    logger.info(
      created
        ? `Admin created: ${user.email}`
        : `A user with email ${user.email} already exists (role: ${user.role}). Nothing changed.`,
    );
  } finally {
    await disconnectDB();
  }
};

seed().catch((error: unknown) => {
  logger.fatal({ err: error }, "Could not seed the admin");
  process.exit(1);
});
