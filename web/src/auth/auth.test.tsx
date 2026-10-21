import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppRoutes } from "../App";
import { ADMIN, CLINICIAN, fakeApi, outcome, renderAt, signIn } from "../test/api";

describe("Sign in", () => {
  it("sends guests to the sign-in page", async () => {
    renderAt(<AppRoutes />, "/");

    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
  });

  it("signs in and shows the user with their role", async () => {
    const api = fakeApi({ "POST /auth/login": { body: { token: "t1", user: ADMIN } } });
    renderAt(<AppRoutes />, "/login");

    await userEvent.type(screen.getByLabelText("Email"), "grace@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "grace-secret-123");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Grace Hopper")).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(api.calls[0]!.body).toEqual({
      email: "grace@example.com",
      password: "grace-secret-123",
    });
  });

  it("shows the API message for wrong credentials", async () => {
    fakeApi({
      "POST /auth/login": { status: 401, body: outcome("Invalid email or password.", "login") },
    });
    renderAt(<AppRoutes />, "/login");

    await userEvent.type(screen.getByLabelText("Email"), "grace@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "nope");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password.");
  });

  it("creates an account and shows field errors next to their field", async () => {
    fakeApi({
      "POST /auth/register": {
        status: 400,
        body: outcome("password: password must have at least 8 characters", "invalid", "password"),
      },
    });
    renderAt(<AppRoutes />, "/login");

    await userEvent.click(screen.getByRole("tab", { name: "Create account" }));
    await userEvent.type(screen.getByLabelText("Full name"), "Alan Kay");
    await userEvent.type(screen.getByLabelText("Email"), "alan@example.com");
    await userEvent.type(screen.getByLabelText(/^Password/), "short");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("password must have at least 8 characters")).toBeInTheDocument();
    expect(screen.getByLabelText(/Password/)).toHaveAttribute("aria-invalid", "true");
  });

  it("checks a saved session and drops it when the token expired", async () => {
    signIn(CLINICIAN);
    fakeApi({
      "GET /auth/me": { status: 401, body: outcome("The token has expired.", "expired") },
    });
    renderAt(<AppRoutes />, "/");

    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    await waitFor(() => expect(sessionStorage.getItem("vitalpulse.session")).toBeNull());
  });

  it("signs out", async () => {
    signIn(ADMIN);
    fakeApi({ "GET /auth/me": { body: { user: ADMIN } } });
    renderAt(<AppRoutes />, "/");

    await userEvent.click(await screen.findByRole("button", { name: "Sign out" }));

    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
  });
});
