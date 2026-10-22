import { ApiError, request } from "./client";
import { fakeApi, outcome } from "../test/api";

describe("request", () => {
  it("sends FHIR JSON with the token", async () => {
    const api = fakeApi({ "POST /fhir/Patient": { status: 201, body: { id: "p1" } } });

    const { data } = await request<{ id: string }>("/fhir/Patient", {
      method: "POST",
      body: { resourceType: "Patient" },
      token: "abc",
    });

    expect(data.id).toBe("p1");
    expect(api.calls[0]!.headers).toMatchObject({
      Authorization: "Bearer abc",
      "Content-Type": "application/fhir+json",
    });
  });

  it("follows absolute URLs such as Bundle paging links", async () => {
    const api = fakeApi({ "GET /fhir/Patient": { body: { resourceType: "Bundle" } } });

    await request("http://localhost:3000/fhir/Patient?_count=10&_page=2");

    expect(api.calls[0]!.url.searchParams.get("_page")).toBe("2");
  });

  it("turns an OperationOutcome into an ApiError with one message per element", async () => {
    fakeApi({
      "POST /fhir/Observation": {
        status: 422,
        body: outcome(
          'Observation.valueQuantity.code: Body temperature is measured in "Cel", not "[degF]".',
          "business-rule",
          "Observation.valueQuantity.code",
        ),
      },
    });

    const error = await request("/fhir/Observation", { method: "POST", body: {} }).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(422);
    expect((error as ApiError).forElement("Observation.valueQuantity.code")).toBe(
      'Body temperature is measured in "Cel", not "[degF]".',
    );
  });

  it("explains when the API cannot be reached", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Failed to fetch")));

    await expect(request("/health")).rejects.toThrow(/Cannot reach the API/);
  });
});
