import type { Issue } from "../errors/app.error.js";
import type { OperationOutcome } from "./types.js";

/**
 * Wraps a list of problems in an OperationOutcome, the FHIR resource for errors.
 * Every issue is an error: the server only sends one when the request failed.
 */
export const operationOutcome = (issues: Issue[]): OperationOutcome => ({
  resourceType: "OperationOutcome",
  issue: issues.map(({ code, diagnostics, expression }) => ({
    severity: "error",
    code,
    diagnostics,
    ...(expression && { expression }),
  })),
});
