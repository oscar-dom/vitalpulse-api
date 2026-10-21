import request from "supertest";
import { app } from "../../src/app.js";
import { createUserWithToken } from "./helpers/auth.js";
import { useTestDatabase } from "./helpers/db.js";
import { createTestObservation, createTestPatient } from "./helpers/factories.js";

useTestDatabase();

const BASE = "http://localhost:3000/fhir";
const TEMPERATURE = { coding: [{ system: "http://loinc.org", code: "8310-5" }] };

type Entry = {
  resource: { resourceType: string; id: string; valueQuantity?: { value: number } };
  search: { mode: string };
};
type SearchBundle = { total: number; entry: Entry[]; link: { relation: string; url: string }[] };

let auth: string;
let ana: string;
let ben: string;

const search = (query: string) =>
  request(app).get(`/fhir/Observation${query}`).set("Authorization", auth);

const values = (bundle: SearchBundle) =>
  bundle.entry
    .filter((entry) => entry.search.mode === "match")
    .map((entry) => entry.resource.valueQuantity!.value);

const linkTo = (bundle: SearchBundle, relation: string) =>
  bundle.link.find((link) => link.relation === relation)?.url;

const heartRate = (patientId: string, value: number, effectiveDateTime: string) =>
  createTestObservation(patientId, { valueQuantity: { value }, effectiveDateTime });

beforeEach(async () => {
  auth = (await createUserWithToken("clinician")).auth;
  ana = (await createTestPatient({ name: [{ family: "Ana" }] })).id;
  ben = (await createTestPatient({ name: [{ family: "Ben" }] })).id;

  // Ana: heart rate on four days (one high, one critical high) and a fever.
  await heartRate(ana, 70, "2026-10-01T08:00:00Z");
  await heartRate(ana, 110, "2026-10-02T08:00:00Z");
  await heartRate(ana, 140, "2026-10-03T08:00:00Z");
  await heartRate(ana, 80, "2026-10-04T08:00:00Z");
  await createTestObservation(ana, {
    code: TEMPERATURE,
    valueQuantity: { value: 38.5 },
    effectiveDateTime: "2026-10-02T09:00:00Z",
  });
  // Ben: one high heart rate, in September.
  await heartRate(ben, 105, "2026-09-15T08:00:00Z");
});

describe("GET /fhir/Observation (search)", () => {
  it("returns every observation, newest first by default", async () => {
    const res = await search("");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ resourceType: "Bundle", type: "searchset", total: 6 });
    expect(values(res.body)).toEqual([80, 140, 38.5, 110, 70, 105]);
  });

  it("filters by patient, with or without the type in the reference", async () => {
    const withType = await search(`?patient=Patient/${ben}`);
    const bareId = await search(`?subject=${ben}`);

    expect(values(withType.body)).toEqual([105]);
    expect(values(bareId.body)).toEqual([105]);
  });

  it("filters by LOINC code", async () => {
    const res = await search("?code=http://loinc.org|8310-5");
    const otherSystem = await search("?code=http://snomed.info/sct|8310-5");

    expect(values(res.body)).toEqual([38.5]);
    expect(otherSystem.body.total).toBe(0);
  });

  it("filters by the interpretation the server worked out", async () => {
    const high = await search("?interpretation=H");
    const abnormal = await search("?interpretation=H,HH&_sort=date");

    expect(values(high.body)).toEqual([38.5, 110, 105]);
    expect(values(abnormal.body)).toEqual([105, 110, 38.5, 140]);
  });

  it("filters by date ranges with prefixes", async () => {
    const october = await search("?date=2026-10&_sort=date");
    const range = await search("?date=ge2026-10-02&date=lt2026-10-04&_sort=date");
    const day = await search("?date=2026-10-03");

    expect(values(october.body)).toEqual([70, 110, 38.5, 140, 80]);
    expect(values(range.body)).toEqual([110, 38.5, 140]);
    expect(values(day.body)).toEqual([140]);
  });

  it("combines filters, sorting and paging in one query", async () => {
    const query = `?patient=${ana}&code=8867-4&interpretation=H,HH&_sort=-date&_count=1`;

    const first = await search(query);
    expect(first.body.total).toBe(2);
    expect(values(first.body)).toEqual([140]);

    const next = await search(new URL(linkTo(first.body, "next")!).search);
    expect(values(next.body)).toEqual([110]);
    expect(linkTo(next.body, "next")).toBeUndefined();
    expect(linkTo(next.body, "self")).toBe(
      `${BASE}/Observation?patient=${ana}&code=8867-4&interpretation=H%2CHH&_sort=-date&_count=1&_page=2`,
    );
  });

  it("adds the patients of the page with _include", async () => {
    const res = await search(`?interpretation=H&_include=Observation:patient`);

    const included = res.body.entry.filter((entry: Entry) => entry.search.mode === "include");
    expect(res.body.total).toBe(3);
    expect(included.map((entry: Entry) => entry.resource.id).sort()).toEqual([ana, ben].sort());
    expect(included[0].resource.resourceType).toBe("Patient");
  });

  it("matches nothing for a patient that is not one of ours", async () => {
    const res = await search("?patient=Patient/unknown");

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });

  it("rejects invalid values", async () => {
    for (const query of [
      "?date=yesterday",
      "?date=2026-13",
      "?interpretation=X",
      "?status=done",
      "?_sort=value",
      "?_include=Observation:performer",
    ]) {
      const res = await search(query);
      expect(res.status, query).toBe(400);
      expect(res.body.resourceType).toBe("OperationOutcome");
    }
  });
});
