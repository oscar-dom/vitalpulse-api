import { z } from "zod";

// bcrypt only uses the first 72 bytes of a password and silently ignores the rest,
// so longer passwords are rejected instead of being cut without notice.
const BCRYPT_MAX_BYTES = 72;

export const registerSchema = z.strictObject({
  name: z
    .string({ error: "name is required" })
    .trim()
    .min(1, "name is required")
    .max(100, "name must have at most 100 characters"),
  email: z
    .string({ error: "email is required" })
    .trim()
    .toLowerCase()
    .pipe(z.email("email must be a valid email address")),
  password: z
    .string({ error: "password is required" })
    .min(8, "password must have at least 8 characters")
    .max(72, "password must have at most 72 characters")
    .refine(
      (password) => Buffer.byteLength(password, "utf8") <= BCRYPT_MAX_BYTES,
      "password is too long",
    ),
});

export type RegisterInput = z.infer<typeof registerSchema>;

// Login only checks that both fields are present: the length rules apply when a
// password is chosen, and a wrong password is simply a failed login.
export const loginSchema = z.object({
  email: z.string({ error: "email is required" }).trim().toLowerCase().min(1, "email is required"),
  password: z.string({ error: "password is required" }).min(1, "password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;
