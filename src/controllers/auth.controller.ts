import type { Request, Response } from "express";
import type { LoginInput, RegisterInput } from "../schemas/auth.schema.js";
import { loginUser, registerUser } from "../services/auth.service.js";

// Accounts are not FHIR resources, so these responses are plain JSON. Errors are
// still OperationOutcome, like everywhere else in the API.

export const register = async (req: Request, res: Response): Promise<void> => {
  const { user, token } = await registerUser(req.body as RegisterInput);
  res.status(201).json({ token, user });
};

export const login = async (req: Request, res: Response): Promise<void> => {
  const { user, token } = await loginUser(req.body as LoginInput);
  res.status(200).json({ token, user });
};

// Only reached through `authenticateToken`, which guarantees `req.user`.
export const me = (req: Request, res: Response): void => {
  res.status(200).json({ user: req.user });
};
