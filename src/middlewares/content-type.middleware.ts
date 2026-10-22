import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app.error.js";
import { FHIR_JSON } from "../fhir/types.js";

// Media types the API reads. FHIR clients send application/fhir+json; plain JSON is
// accepted too, so generic tools work without extra headers.
export const ACCEPTED_BODY_TYPES = ["application/json", FHIR_JSON];

/**
 * 415 when a request carries a body in a format the API does not read (XML, a form,
 * plain text...). Without this check express.json() would skip the body and the
 * request would fail later with a confusing "missing field" error.
 */
export const requireJsonBody = (req: Request, _res: Response, next: NextFunction): void => {
  if (req.is(ACCEPTED_BODY_TYPES) === false) {
    throw new AppError(
      `Unsupported Content-Type "${req.headers["content-type"]}". Send ${FHIR_JSON} or application/json.`,
      415,
    );
  }
  next();
};
