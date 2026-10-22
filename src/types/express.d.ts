import type { UserDocument } from "../models/user.model.js";

// The authenticateToken middleware attaches the logged-in user to the request.
declare global {
  namespace Express {
    interface Request {
      user?: UserDocument;
    }
  }
}

export {};
