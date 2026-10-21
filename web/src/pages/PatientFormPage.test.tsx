import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppRoutes } from "../App";
import { ADMIN, CLINICIAN, fakeApi, outcome, renderAt, signIn } from "../test/api";
import { bundle, patient } from "../test/fixtures";

const afterSave = {
  "GET /fhir/Observation": { body: bundle([], 0) },
};

describe("Patient form page", () => {
  it("creates a patient and opens it", async () => {
    signIn(ADMIN);
    const api = fakeApi({
      "GET /auth/me": { body: { user: ADMIN } },
      "POST /fhir/Patient": { status: 201, body: patient("p9", "Hopper") },
      "GET /fhir/Patient/p9": { body: patient("p9", "Hopper") },
      ...afterSave,
    });
    renderAt(<AppRoutes />, "/patients/new");

    await userEvent.type(await screen.findByLabelText("Given names"), "Grace Brewster");
    await userEvent.type(screen.getByLabelText("Family name"), "Hopper");
    await userEvent.type(screen.getByLabelText(/^Medical record number/), "MRN-0100");
    await userEvent.selectOptions(screen.getByLabelText("Gender"), "female");
    await userEvent.type(screen.getByLabelText("Birth date"), "1906-12-09");
    await userEvent.click(screen.getByRole("button", { name: "Create patient" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Patient created.");
    expect(api.calls.find((call) => call.method === "POST")!.body).toEqual({
      resourceType: "Patient",
      identifier: [{ system: "https://hospital.example.org/mrn", value: "MRN-0100" }],
      name: [{ use: "official", family: "Hopper", given: ["Grace", "Brewster"] }],
      active: true,
      gender: "female",
      birthDate: "1906-12-09",
    });
  });

  it("shows a duplicate identifier next to the MRN field", async () => {
    signIn(ADMIN);
    fakeApi({
      "GET /auth/me": { body: { user: ADMIN } },
      "POST /fhir/Patient": {
        status: 409,
        body: outcome(
          "Another patient already has one of these identifiers.",
          "duplicate",
          "Patient.identifier",
        ),
      },
    });
    renderAt(<AppRoutes />, "/patients/new");

    await userEvent.type(await screen.findByLabelText("Family name"), "Hopper");
    await userEvent.type(screen.getByLabelText(/^Medical record number/), "MRN-0042");
    await userEvent.click(screen.getByRole("button", { name: "Create patient" }));

    expect(
      await screen.findByText("Another patient already has one of these identifiers."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Medical record number/)).toHaveAttribute("aria-invalid", "true");
  });

  it("updates with If-Match, keeping what the form does not show", async () => {
    signIn(ADMIN);
    const stored = patient("a", "Lovelace", {
      meta: { versionId: "3" },
      identifier: [
        { system: "urn:mrn", value: "MRN-a" },
        { system: "urn:passport", value: "X123" },
      ],
      name: [
        { use: "official", family: "Lovelace", given: ["Ada"] },
        { use: "maiden", family: "Byron" },
      ],
    });
    const api = fakeApi({
      "GET /auth/me": { body: { user: ADMIN } },
      "GET /fhir/Patient/a": { body: stored },
      "PUT /fhir/Patient/a": { body: { ...stored, meta: { versionId: "4" } } },
      ...afterSave,
    });
    renderAt(<AppRoutes />, "/patients/a/edit");

    const family = await screen.findByLabelText("Family name");
    await userEvent.clear(family);
    await userEvent.type(family, "King");
    await userEvent.click(screen.getByRole("checkbox", { name: /Active/ }));
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Patient updated.");
    const put = api.calls.find((call) => call.method === "PUT")!;
    expect(put.headers["If-Match"]).toBe('W/"3"');
    expect(put.body).toMatchObject({
      id: "a",
      active: false,
      identifier: [{ value: "MRN-a" }, { system: "urn:passport", value: "X123" }],
      name: [
        { family: "King", given: ["Ada"] },
        { use: "maiden", family: "Byron" },
      ],
    });
    expect(put.body).not.toHaveProperty("meta");
  });

  it("explains why a patient with observations cannot be deleted", async () => {
    signIn(ADMIN);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fakeApi({
      "GET /auth/me": { body: { user: ADMIN } },
      "GET /fhir/Patient/a": { body: patient("a", "Lovelace") },
      "DELETE /fhir/Patient/a": {
        status: 409,
        body: outcome(
          "Patient/a has observations and cannot be deleted. Update it with active: false instead.",
          "conflict",
        ),
      },
    });
    renderAt(<AppRoutes />, "/patients/a/edit");

    await userEvent.click(await screen.findByRole("button", { name: "Delete patient" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "has observations and cannot be deleted",
    );
  });

  it("is for admins only", async () => {
    signIn(CLINICIAN);
    fakeApi({ "GET /auth/me": { body: { user: CLINICIAN } } });
    renderAt(<AppRoutes />, "/patients/new");

    expect(await screen.findByRole("alert")).toHaveTextContent("Only administrators");
  });
});
