import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env.js";

export interface TokenPayload {
  sub: string; // user id
}

// The token only identifies the user. The role is read from the database on each
// request, so an approved admin request or a deleted account applies at once.
export const signToken = (userId: string): string =>
  jwt.sign({ sub: userId } satisfies TokenPayload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
  });

/** Returns the payload of a valid token. Throws if it is malformed, forged or expired. */
export const verifyToken = (token: string): TokenPayload => {
  const payload = jwt.verify(token, env.JWT_SECRET);
  if (typeof payload === "string" || typeof payload.sub !== "string") {
    throw new jwt.JsonWebTokenError("invalid token payload");
  }
  return { sub: payload.sub };
};
