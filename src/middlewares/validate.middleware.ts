import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { ZodType, core } from "zod";
import { type Issue, ValidationError } from "../errors/app.error.js";

/**
 * Turns a Zod path into a FHIRPath-like expression: ["name", 0, "family"] becomes
 * "name[0].family". `root` is put in front, e.g. "Patient".
 */
export const toExpression = (path: PropertyKey[], root?: string): string =>
  path.reduce<string>(
    (expression, segment) =>
      typeof segment === "number"
        ? `${expression}[${segment}]`
        : expression
          ? `${expression}.${String(segment)}`
          : String(segment),
    root ?? "",
  );

const bodyIssues = (issue: core.$ZodIssue, root?: string): Issue[] => {
  // An element the schema does not know: one issue per element, pointing at it, so the
  // client sees exactly what the server refused to store.
  if (issue.code === "unrecognized_keys") {
    return issue.keys.map((key) => {
      const expression = toExpression([...issue.path, key], root);
      return {
        code: "structure",
        diagnostics: `${expression}: this element is not supported by this server`,
        expression: [expression],
      };
    });
  }

  const expression = toExpression(issue.path, root);
  return [
    {
      code: "invalid",
      diagnostics: expression ? `${expression}: ${issue.message}` : issue.message,
      ...(expression && { expression: [expression] }),
    },
  ];
};

const queryIssue = (issue: core.$ZodIssue): Issue => {
  const parameter = issue.path.map(String).join(".");
  return {
    code: "invalid",
    diagnostics: parameter ? `Parameter "${parameter}": ${issue.message}` : issue.message,
  };
};

/**
 * Validates and parses the request body. On success the parsed value (trimmed, with
 * defaults) replaces the raw one; on failure every invalid element is reported at once
 * as a 400 OperationOutcome. `root` prefixes the expressions, e.g. "Patient".
 */
export const validateBody =
  (schema: ZodType, root?: string): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      next(new ValidationError(result.error.issues.flatMap((issue) => bodyIssues(issue, root))));
      return;
    }
    req.body = result.data;
    next();
  };

/** Same as validateBody, for the query string. */
export const validateQuery =
  (schema: ZodType): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(new ValidationError(result.error.issues.map(queryIssue)));
      return;
    }
    // Express 5 exposes req.query through a getter, so it cannot be assigned:
    // shadow it with an own property holding the parsed value instead.
    Object.defineProperty(req, "query", {
      value: result.data,
      writable: true,
      enumerable: true,
      configurable: true,
    });
    next();
  };
