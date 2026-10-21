import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppRoutes } from "../App";
import { CLINICIAN, fakeApi, outcome, renderAt, signIn } from "../test/api";
import { bundle, observation, patient } from "../test/fixtures";

const routes = (extra: Record<string, unknown> = {}) => ({
  "GET /auth/me": { body: { user: CLINICIAN } },
  "GET /fhir/Patient": { body: bundle([patient("a", "Lovelace"), patient("b", "Turing")], 2) },
  "GET /fhir/Patient/a": { body: patient("a", "Lovelace") },
  ...extra,
});

describe("Record observation page", () => {
  it("previews the result while typing, with the same ranges as the server", async () => {
    signIn(CLINICIAN);
    fakeApi(routes());
    renderAt(<AppRoutes />, "/observations/new?patient=a");

    const value = await screen.findByLabelText(/^Value/);
    await userEvent.type(value, "118");
    expect(screen.getByRole("status")).toHaveTextContent("High");

    await userEvent.clear(value);
    await userEvent.type(value, "100");
    expect(screen.getByRole("status")).toHaveTextContent("Normal");

    await userEvent.click(screen.getByRole("button", { name: /Oxygen saturation/ }));
    await userEvent.type(screen.getByLabelText(/^Value/), "86");
    expect(screen.getByRole("status")).toHaveTextContent("Critical low");

    await userEvent.clear(screen.getByLabelText(/^Value/));
    await userEvent.type(screen.getByLabelText(/^Value/), "150");
    expect(screen.getByText(/is not a possible oxygen saturation/)).toBeInTheDocument();
  });

  it("posts a vital-signs Observation and opens the patient with the server's result", async () => {
    signIn(CLINICIAN);
    const api = fakeApi(
      routes({
        "POST /fhir/Observation": {
          status: 201,
          body: {
            ...observation("a", "8867-4", 118, "H", "2026-10-21T08:30:00Z"),
            valueQuantity: { value: 118, unit: "beats/minute" },
          },
        },
        "GET /fhir/Observation": { body: bundle([], 0) },
      }),
    );
    renderAt(<AppRoutes />, "/observations/new?patient=a");

    expect(
      await screen.findByRole("option", { name: "Test Lovelace · MRN-a" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Patient")).toHaveValue("a");
    await userEvent.type(screen.getByLabelText(/^Value/), "118");
    await userEvent.click(screen.getByRole("button", { name: "Save observation" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Heart rate 118 beats/minute saved · High.",
    );
    const post = api.calls.find((call) => call.method === "POST")!;
    expect(post.body).toMatchObject({
      resourceType: "Observation",
      status: "final",
      code: { coding: [{ system: "http://loinc.org", code: "8867-4" }] },
      subject: { reference: "Patient/a" },
      valueQuantity: { value: 118 },
    });
    expect((post.body as { effectiveDateTime: string }).effectiveDateTime).toMatch(/Z$/);
  });

  it("shows the server's errors next to the field they are about", async () => {
    signIn(CLINICIAN);
    fakeApi(
      routes({
        "POST /fhir/Observation": {
          status: 422,
          body: outcome(
            "Patient/a is inactive and does not accept new observations.",
            "business-rule",
            "Observation.subject",
          ),
        },
      }),
    );
    renderAt(<AppRoutes />, "/observations/new?patient=a");

    await userEvent.type(await screen.findByLabelText(/^Value/), "80");
    await userEvent.click(screen.getByRole("button", { name: "Save observation" }));

    expect(
      await screen.findByText("Patient/a is inactive and does not accept new observations."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Patient/)).toHaveAttribute("aria-invalid", "true");
  });
});
