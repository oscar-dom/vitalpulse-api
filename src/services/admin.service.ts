import { UserModel } from "../models/user.model.js";
import type { RegisterInput } from "../schemas/auth.schema.js";

/**
 * Creates the first admin account. Safe to run more than once: if the email is
 * already registered nothing changes, so an existing account is never overwritten.
 */
export const ensureAdmin = async (input: RegisterInput) => {
  const existing = await UserModel.findOne({ email: input.email });
  if (existing) return { created: false, user: existing };

  const user = await UserModel.create({ ...input, role: "admin" });
  return { created: true, user };
};
