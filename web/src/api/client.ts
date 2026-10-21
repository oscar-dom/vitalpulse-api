import type { OperationOutcome } from "fhir/r4";

export const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(
  /\/+$/,
  "",
);

const FHIR_JSON = "application/fhir+json";

/** One problem reported by the API, from an OperationOutcome issue. */
export interface ApiIssue {
  code: string;
  message: string;
  // FHIRPath of the element at fault, e.g. "Observation.valueQuantity.value".
  expression?: string;
}

/** A failed request. Every API error is an OperationOutcome; this is its readable form. */
export class ApiError extends Error {
  readonly status: number;
  readonly issues: ApiIssue[];

  constructor(status: number, issues: ApiIssue[]) {
    super(issues.map((issue) => issue.message).join(" ") || `Request failed (${status}).`);
    this.name = "ApiError";
    this.status = status;
    this.issues = issues;
  }

  /** The message for one element, e.g. "Observation.valueQuantity.value". */
  forElement(expression: string): string | undefined {
    return this.issues.find((issue) => issue.expression === expression)?.message;
  }
}

const issuesOf = (outcome: Partial<OperationOutcome> | undefined): ApiIssue[] =>
  (outcome?.issue ?? []).map((issue) => ({
    code: issue.code,
    // The API puts "Patient.name[0]: needs a family name" in diagnostics; the element
    // is already in expression, so keep only the human part.
    message: (issue.diagnostics ?? issue.details?.text ?? issue.code).replace(
      /^[A-Za-z]+(\.[\w[\]]+)*: /,
      "",
    ),
    ...(issue.expression?.[0] && { expression: issue.expression[0] }),
  }));

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  token?: string | null;
  headers?: Record<string, string>;
}

export interface ApiResponse<T> {
  data: T;
  headers: Headers;
}

/**
 * Calls the API. `target` is a path ("/fhir/Patient") or an absolute URL, such as a
 * Bundle paging link, which the API already builds in full.
 */
export const request = async <T>(
  target: string,
  { method = "GET", body, token, headers = {} }: RequestOptions = {},
): Promise<ApiResponse<T>> => {
  const url = /^https?:\/\//.test(target) ? target : `${API_URL}${target}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Accept: `${FHIR_JSON}, application/json`,
        ...(body !== undefined && { "Content-Type": FHIR_JSON }),
        ...(token && { Authorization: `Bearer ${token}` }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, [
      {
        code: "exception",
        message: `Cannot reach the API at ${API_URL}. Is it running?`,
      },
    ]);
  }

  const text = await response.text();
  const json: unknown = text ? JSON.parse(text) : undefined;

  if (!response.ok) {
    throw new ApiError(response.status, issuesOf(json as OperationOutcome | undefined));
  }
  return { data: json as T, headers: response.headers };
};
