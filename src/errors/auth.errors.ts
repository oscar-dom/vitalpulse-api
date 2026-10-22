import { AppError } from "./app.error.js";

// Authentication and authorization errors. Each one picks the FHIR issue code that
// tells the client what to do next.

/** 401: the request carries no Bearer token. */
export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required. Send a Bearer token.") {
    super(message, 401, { code: "login" });
    this.name = "UnauthorizedError";
  }
}

/** 401: the token is forged, expired or points to a user that no longer exists. */
export class InvalidTokenError extends AppError {
  constructor(message = "The token is not valid.", code: "security" | "expired" = "security") {
    super(message, 401, { code });
    this.name = "InvalidTokenError";
  }
}

/** 401: wrong email or password (the same error for both). */
export class InvalidCredentialsError extends AppError {
  constructor() {
    super("Invalid email or password.", 401, { code: "login" });
    this.name = "InvalidCredentialsError";
  }
}

/** 403: the user is identified, but their role is not allowed. */
export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action.") {
    super(message, 403, { code: "forbidden" });
    this.name = "ForbiddenError";
  }
}

/** 409: the email of a sign-up is already taken. */
export class EmailAlreadyRegisteredError extends AppError {
  constructor() {
    super("Email is already registered.", 409, { code: "duplicate", expression: ["email"] });
    this.name = "EmailAlreadyRegisteredError";
  }
}
