import { type User, type UserRole, UserModel } from "../../../src/models/user.model.js";
import { signToken } from "../../../src/services/token.service.js";

let counter = 0;

/**
 * Creates a user straight in the database and returns it with a ready-to-use
 * Authorization header, so tests of protected routes skip the login request.
 */
export const createUserWithToken = async (
  role: UserRole = "clinician",
  overrides: Partial<User> = {},
) => {
  counter += 1;
  const user = await UserModel.create({
    name: `Test ${role} ${counter}`,
    email: `${role}${counter}@example.com`,
    password: "plain-secret-123",
    role,
    ...overrides,
  });
  return { user, auth: `Bearer ${signToken(user.id)}` };
};
