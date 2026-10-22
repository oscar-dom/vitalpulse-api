import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppRoutes } from "../App";
import { ADMIN, CLINICIAN, fakeApi, renderAt, signIn } from "../test/api";
import { BASE, bundle, observation, patient } from "../test/fixtures";

describe("Patients page", () => {
  it("lists patients with their out-of-range latest results", async () => {
    signIn(CLINICIAN);
    const api = fakeApi({
      "GET /auth/me": { body: { user: CLINICIAN } },
      "GET /fhir/Patient": {
        body: bundle([patient("a", "Lovelace"), patient("b", "Turing"), patient("c", "Curie")], 3, {
          self: `${BASE}/Patient?_count=10&_page=1`,
        }),
      },
      "GET /fhir/Observation": {
        body: bundle(
          [
            // Newest first: only the latest heart rate of "a" counts.
            observation("a", "8867-4", 118, "H", "2026-10-21T08:30:00Z"),
            observation("a", "2708-6", 86, "LL", "2026-10-21T07:00:00Z"),
            observation("a", "8867-4", 72, "N", "2026-10-20T08:30:00Z"),
            observation("b", "8867-4", 70, "N", "2026-10-21T08:30:00Z"),
          ],
          4,
        ),
      },
    });
    renderAt(<AppRoutes />, "/");

    const ada = (await screen.findByRole("link", { name: "Test Lovelace" })).closest("tr")!;
    expect(within(ada).getByText("HR 118 · High")).toBeInTheDocument();
    expect(within(ada).getByText("SpO₂ 86 · Critical")).toBeInTheDocument();
    const alan = screen.getByRole("link", { name: "Test Turing" }).closest("tr")!;
    expect(within(alan).getByText("All normal")).toBeInTheDocument();
    const marie = screen.getByRole("link", { name: "Test Curie" }).closest("tr")!;
    expect(within(marie).getByText("No results")).toBeInTheDocument();
    expect(screen.getByText("Showing 1–3 of 3 patients")).toBeInTheDocument();

    const observationSearch = api.calls.find((call) => call.url.pathname === "/fhir/Observation")!;
    expect(observationSearch.url.searchParams.get("patient")).toBe("a,b,c");
    expect(observationSearch.url.searchParams.get("_sort")).toBe("-date");
  });

  it("searches with FHIR parameters and pages with the Bundle links", async () => {
    signIn(CLINICIAN);
    const api = fakeApi({
      "GET /auth/me": { body: { user: CLINICIAN } },
      "GET /fhir/Patient": ({ url }) =>
        url.searchParams.get("_page") === "2"
          ? {
              body: bundle([patient("k", "King")], 11, {
                self: `${BASE}/Patient?name=k&_count=10&_page=2`,
                previous: `${BASE}/Patient?name=k&_count=10&_page=1`,
              }),
            }
          : {
              body: bundle([patient("a", "Kay")], 11, {
                self: `${BASE}/Patient?name=k&_count=10&_page=1`,
                next: `${BASE}/Patient?name=k&_count=10&_page=2`,
              }),
            },
      "GET /fhir/Observation": { body: bundle([], 0) },
    });
    renderAt(<AppRoutes />, "/");
    await screen.findByRole("link", { name: "Test Kay" });

    await userEvent.type(screen.getByLabelText("Name"), "k");
    await userEvent.selectOptions(screen.getByLabelText("Gender"), "female");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));

    const searches = () => api.calls.filter((call) => call.url.pathname === "/fhir/Patient");
    await screen.findByRole("button", { name: "Next" });
    const last = searches().at(-1)!.url.searchParams;
    expect(last.get("name")).toBe("k");
    expect(last.get("gender")).toBe("female");
    expect(last.get("active")).toBe("true");

    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("link", { name: "Test King" })).toBeInTheDocument();
    expect(searches().at(-1)!.url.toString()).toBe(`${BASE}/Patient?name=k&_count=10&_page=2`);
    expect(screen.getByText("Showing 11–11 of 11 patients")).toBeInTheDocument();
  });

  it("offers New patient to admins only", async () => {
    signIn(ADMIN);
    fakeApi({
      "GET /auth/me": { body: { user: ADMIN } },
      "GET /fhir/Patient": { body: bundle([], 0) },
    });
    renderAt(<AppRoutes />, "/");

    expect(await screen.findByRole("link", { name: "New patient" })).toBeInTheDocument();
    expect(await screen.findByText("No patients match this search.")).toBeInTheDocument();
  });
});
