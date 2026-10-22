import type { OperationOutcomeIssue } from "../fhir/types.js";

export type IssueCode = OperationOutcomeIssue["code"];

/** One problem found in a request, reported as an OperationOutcome issue. */
export interface Issue {
  code: IssueCode;
  diagnostics: string;
  // FHIRPath of the element at fault, e.g. "Observation.valueQuantity.value".
  expression?: string[];
}

// The issue code that best describes each HTTP status, from the FHIR IssueType value set.
const ISSUE_CODES: Record<number, IssueCode> = {
  400: "invalid",
  401: "login",
  403: "forbidden",
  404: "not-found",
  405: "not-supported",
  409: "conflict",
  410: "deleted",
  412: "conflict",
  415: "not-supported",
  422: "business-rule",
  429: "throttled",
  500: "exception",
};

/**
 * Expected error with a known HTTP status. Throw it from services and controllers;
 * the global error handler turns it into an OperationOutcome.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly issues: Issue[];
  // Operational errors are expected situations (bad input, missing resource), not bugs.
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode = 400,
    options: { code?: IssueCode; expression?: string[]; issues?: Issue[] } = {},
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.issues = options.issues ?? [
      {
        code: options.code ?? ISSUE_CODES[statusCode] ?? "processing",
        diagnostics: message,
        ...(options.expression && { expression: options.expression }),
      },
    ];

    // Keeps `instanceof AppError` reliable for subclasses.
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

/** Client input that does not match the expected schema (400), one issue per problem. */
export class ValidationError extends AppError {
  constructor(issues: Issue[]) {
    super("The request is not valid.", 400, { issues });
    this.name = "ValidationError";
  }
}

/** 404: the resource does not exist (or the id is not one this server could have made). */
export class NotFoundError extends AppError {
  constructor(resourceType: string, id: string) {
    super(`${resourceType}/${id} not found.`, 404);
    this.name = "NotFoundError";
  }
}

/** 410: the resource existed but was deleted. */
export class GoneError extends AppError {
  constructor(resourceType: string, id: string) {
    super(`${resourceType}/${id} has been deleted.`, 410);
    this.name = "GoneError";
  }
}

/** 422: the request is well formed but breaks a business rule. */
export class BusinessRuleError extends AppError {
  constructor(message: string, expression?: string[]) {
    super(message, 422, { expression });
    this.name = "BusinessRuleError";
  }
}
