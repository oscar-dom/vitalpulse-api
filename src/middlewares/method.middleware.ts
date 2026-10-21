import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app.error.js";

/**
 * 405 for a method the path does not support (e.g. DELETE /fhir/Observation/{id}),
 * with an Allow header listing the ones it does. Register it with `.all()` after the
 * supported methods of a route.
 */
export const methodNotAllowed =
  (...allowed: string[]) =>
  (req: Request, res: Response, _next: NextFunction): void => {
    res.set("Allow", allowed.join(", "));
    throw new AppError(
      `${req.method} is not supported on ${req.baseUrl}${req.path}. Allowed: ${allowed.join(", ")}.`,
      405,
    );
  };
