import type { ErrorRequestHandler, Request, Response } from "express";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { AppError, type Issue } from "../errors/app.error.js";
import { operationOutcome } from "../fhir/operation-outcome.js";
import { FHIR_JSON } from "../fhir/types.js";

/** Sends a failed response. Every error of the API, FHIR or not, is an OperationOutcome. */
export const sendOutcome = (res: Response, status: number, issues: Issue[]): void => {
  res.status(status).type(FHIR_JSON).json(operationOutcome(issues));
};

// Catches any request that did not match a route.
export const notFoundHandler = (req: Request, res: Response): void => {
  sendOutcome(res, 404, [
    { code: "not-found", diagnostics: `Route not found: ${req.method} ${req.originalUrl}` },
  ]);
};

// Turns every error into an OperationOutcome. Must be registered last.
export const globalErrorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    sendOutcome(res, err.statusCode, err.issues);
    return;
  }

  // express.json() rejects a body that is not valid JSON.
  if (err?.type === "entity.parse.failed") {
    sendOutcome(res, 400, [
      { code: "structure", diagnostics: "The request body is not valid JSON." },
    ]);
    return;
  }

  // Other body-parser errors (body too large, unsupported charset) carry their own
  // status and a message that is safe to show.
  if (err?.expose === true && typeof err.status === "number") {
    sendOutcome(res, err.status, [{ code: "invalid", diagnostics: String(err.message) }]);
    return;
  }

  // Unexpected error: log it. Only in development does the response show the stack
  // trace, to help debugging; elsewhere internals never reach the client.
  logger.error({ err }, "Unhandled error");
  const stack = env.NODE_ENV === "development" ? (err as Error)?.stack : undefined;
  sendOutcome(res, 500, [
    {
      code: "exception",
      diagnostics: stack
        ? `An unexpected error occurred.\n${stack}`
        : "An unexpected error occurred.",
    },
  ]);
};
