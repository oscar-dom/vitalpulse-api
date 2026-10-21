import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppRoutes } from "../App";
import { ADMIN, CLINICIAN, fakeApi, outcome, renderAt, signIn } from "../test/api";
import { BASE, bundle, observation, patient } from "../test/fixtures";

const ADA = patient("a", "Lovelace", { meta: { versionId: "2" } });

const recent = [
  observation("a", "8867-4", 118, "H", "2026-10-21T08:30:00Z"),
  observation("a", "2708-6", 86, "LL", "2026-10-21T07:05:00Z"),
  observation("a", "8867-4", 180, "HH", "2026-10-20T20:15:00Z", {
    status: "entered-in-error",
    meta: { versionId: "2" },
  }),
  observation("a", "8867-4", 72, "N", "2026-10-20T08:30:00Z"),
];

describe("Patient detail page", () => {
  it("shows the patient, the latest value of each vital sign and the history", async () => {
    signIn(CLINICIAN);
    fakeApi({
      "GET /auth/me": { body: { user: CLINICIAN } },
      "GET /fhir/Patient/a": { body: ADA },
      "GET /fhir/Observation": { body: bundle(recent, 4, { self: `${BASE}/Observation?_page=1` }) },
    });
    renderAt(<AppRoutes />, "/patients/a");

    expect(await screen.findByRole("heading", { name: "Test Lovelace" })).toBeInTheDocument();
    const heart = screen.getByRole("heading", { name: "Heart rate" }).closest("article")!;
    // The value entered in error does not count as the latest result.
    expect(within(heart).getByText("118")).toBeInTheDocument();
    expect(within(heart).getByText("High")).toBeInTheDocument();
    const breathing = screen.getByRole("heading", { name: "Respiratory rate" }).closest("article")!;
    expect(within(breathing).getByText("No results yet.")).toBeInTheDocument();

    const history = screen.getByRole("table");
    expect(await within(history).findByText("Entered in error")).toBeInTheDocument();
    // Clinicians can record but not edit the patient.
    const header = screen.getByRole("region", { name: "Patient" });
    expect(within(header).getByRole("link", { name: "Record vital sign" })).toHaveAttribute(
      "href",
      "/observations/new?patient=a",
    );
    expect(screen.queryByRole("link", { name: "Edit patient" })).not.toBeInTheDocument();
  });

  it("filters the history with the interpretation search parameter", async () => {
    signIn(ADMIN);
    const api = fakeApi({
      "GET /auth/me": { body: { user: ADMIN } },
      "GET /fhir/Patient/a": { body: ADA },
      "GET /fhir/Observation": ({ url }) => ({
        body: bundle(url.searchParams.get("interpretation") === "LL,HH" ? [recent[1]!] : recent, 4),
      }),
    });
    renderAt(<AppRoutes />, "/patients/a");
    await screen.findByRole("heading", { name: "Test Lovelace" });

    await userEvent.click(screen.getByRole("button", { name: "Critical" }));

    expect(screen.getByRole("button", { name: "Critical" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const last = api.calls.filter((call) => call.url.pathname === "/fhir/Observation").at(-1)!;
    expect(last.url.searchParams.get("interpretation")).toBe("LL,HH");
    expect(last.url.searchParams.get("patient")).toBe("a");
    expect(screen.getByRole("link", { name: "Edit patient" })).toBeInTheDocument();
  });

  it("shows the previous value of an amended observation", async () => {
    signIn(CLINICIAN);
    const amended = observation("a", "8867-4", 88, "N", "2026-10-20T20:15:00Z", {
      status: "amended",
      meta: { versionId: "2" },
    });
    fakeApi({
      "GET /auth/me": { body: { user: CLINICIAN } },
      "GET /fhir/Patient/a": { body: ADA },
      "GET /fhir/Observation": { body: bundle([amended], 1) },
      [`GET /fhir/Observation/${amended.id}/_history/1`]: {
        body: { ...amended, valueQuantity: { value: 180 } },
      },
    });
    renderAt(<AppRoutes />, "/patients/a");

    expect(await screen.findByText("v2 · was 180")).toBeInTheDocument();
  });

  it("marks an observation as entered in error with If-Match", async () => {
    signIn(CLINICIAN);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const target = recent[0]!;
    const api = fakeApi({
      "GET /auth/me": { body: { user: CLINICIAN } },
      "GET /fhir/Patient/a": { body: ADA },
      "GET /fhir/Observation": { body: bundle([target], 1) },
      [`PUT /fhir/Observation/${target.id}`]: { body: { ...target, status: "entered-in-error" } },
    });
    renderAt(<AppRoutes />, "/patients/a");

    await userEvent.click(await screen.findByRole("button", { name: "Mark as error" }));

    const put = api.calls.find((call) => call.method === "PUT")!;
    expect(put.headers["If-Match"]).toBe('W/"1"');
    expect(put.body).toMatchObject({
      resourceType: "Observation",
      id: target.id,
      status: "entered-in-error",
    });
    expect(put.body).not.toHaveProperty("interpretation");
    expect(put.body).not.toHaveProperty("referenceRange");
  });

  it("explains a deleted patient", async () => {
    signIn(CLINICIAN);
    fakeApi({
      "GET /auth/me": { body: { user: CLINICIAN } },
      "GET /fhir/Patient/gone": {
        status: 410,
        body: outcome("Patient/gone has been deleted.", "deleted"),
      },
    });
    renderAt(<AppRoutes />, "/patients/gone");

    expect(await screen.findByRole("alert")).toHaveTextContent("This patient has been deleted.");
  });
});
