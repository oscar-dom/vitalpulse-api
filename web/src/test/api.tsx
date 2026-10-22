import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../auth/AuthContext";

type Reply = { status?: number; body?: unknown; headers?: Record<string, string> };
type Handler = Reply | ((request: { url: URL; body: unknown; init: RequestInit }) => Reply);

export interface FakeApi {
  calls: { method: string; url: URL; body: unknown; headers: Record<string, string> }[];
}

/**
 * Replaces fetch with a fake API. Keys are "METHOD /path" (query string ignored);
 * a request with no handler fails the test with a clear message.
 */
export const fakeApi = (routes: Record<string, Handler>): FakeApi => {
  const api: FakeApi = { calls: [] };
  vi.stubGlobal("fetch", async (input: string, init: RequestInit = {}) => {
    const url = new URL(input);
    const method = init.method ?? "GET";
    const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    api.calls.push({ method, url, body, headers: (init.headers ?? {}) as Record<string, string> });

    const handler = routes[`${method} ${url.pathname}`];
    if (!handler) throw new Error(`No fake API route for ${method} ${url.pathname}`);
    const reply = typeof handler === "function" ? handler({ url, body, init }) : handler;
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), {
      status: reply.status ?? 200,
      headers: reply.headers,
    });
  });
  return api;
};

export const outcome = (diagnostics: string, code = "invalid", expression?: string) => ({
  resourceType: "OperationOutcome",
  issue: [
    { severity: "error", code, diagnostics, ...(expression && { expression: [expression] }) },
  ],
});

export const ADMIN = { id: "u1", name: "Grace Hopper", email: "grace@example.com", role: "admin" };
export const CLINICIAN = {
  id: "u2",
  name: "Alan Kay",
  email: "alan@example.com",
  role: "clinician",
};

/** Starts the test signed in as `user`, as if the session had been saved earlier. */
export const signIn = (user: object = ADMIN): void => {
  sessionStorage.setItem("vitalpulse.session", JSON.stringify({ token: "test-token", user }));
};

/** Renders a page inside the auth provider and a router at `path`. */
export const renderAt = (ui: ReactElement, path = "/") =>
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </AuthProvider>,
  );

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});
