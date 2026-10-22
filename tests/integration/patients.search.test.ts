import request from "supertest";
import { app } from "../../src/app.js";
import { createUserWithToken } from "./helpers/auth.js";
import { useTestDatabase } from "./helpers/db.js";
import { createTestPatient, MRN_SYSTEM } from "./helpers/factories.js";

useTestDatabase();

const BASE = "http://localhost:3000/fhir";

let auth: string;

beforeEach(async () => {
  auth = (await createUserWithToken("clinician")).auth;
});

const search = (query: string) =>
  request(app).get(`/fhir/Patient${query}`).set("Authorization", auth);

const families = (bundle: { entry: { resource: { name: { family: string }[] } }[] }) =>
  bundle.entry.map((entry) => entry.resource.name[0]!.family);

const linkTo = (bundle: { link: { relation: string; url: string }[] }, relation: string) =>
  bundle.link.find((link) => link.relation === relation)?.url;

describe("GET /fhir/Patient (search)", () => {
  it("returns a searchset Bundle with total and entries", async () => {
    const patient = await createTestPatient({ name: [{ family: "Curie", given: ["Marie"] }] });

    const res = await search("");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/fhir+json");
    expect(res.body).toMatchObject({ resourceType: "Bundle", type: "searchset", total: 1 });
    expect(res.body.entry[0]).toEqual({
      fullUrl: `${BASE}/Patient/${patient.id}`,
      resource: expect.objectContaining({ resourceType: "Patient", id: patient.id }),
      search: { mode: "match" },
    });
  });

  it("matches the start of family or given names, ignoring case", async () => {
    await createTestPatient({ name: [{ family: "Curie", given: ["Marie"] }] });
    await createTestPatient({ name: [{ family: "Pasteur", given: ["Louis"] }] });
    await createTestPatient({ name: [{ family: "Marchand", given: ["Ana"] }] });

    expect(families((await search("?name=mar")).body).sort()).toEqual(["Curie", "Marchand"]);
    expect(families((await search("?family=CUR")).body)).toEqual(["Curie"]);
    expect(families((await search("?family:exact=curie")).body)).toEqual([]);
    expect(families((await search("?name:contains=ste")).body)).toEqual(["Pasteur"]);
  });

  it("finds by identifier, gender and active, combined", async () => {
    await createTestPatient({
      identifier: [{ system: MRN_SYSTEM, value: "A-1" }],
      gender: "male",
      name: [{ family: "Alpha" }],
    });
    await createTestPatient({ gender: "male", active: false, name: [{ family: "Beta" }] });
    await createTestPatient({ gender: "female", name: [{ family: "Gamma" }] });

    expect(families((await search(`?identifier=${MRN_SYSTEM}|A-1`)).body)).toEqual(["Alpha"]);
    expect(families((await search("?identifier=A-1")).body)).toEqual(["Alpha"]);
    expect(families((await search("?gender=male&active=true")).body)).toEqual(["Alpha"]);
    // A comma means OR.
    expect(families((await search("?gender=male,female&active=true")).body)).toEqual([
      "Alpha",
      "Gamma",
    ]);
  });

  it("leaves deleted patients out", async () => {
    const patient = await createTestPatient();
    patient.deleted = true;
    await patient.save();

    const res = await search("");

    expect(res.body.total).toBe(0);
    expect(res.body.entry).toEqual([]);
  });

  it("pages with _count and links to follow", async () => {
    for (const family of ["A", "B", "C", "D", "E"]) {
      await createTestPatient({ name: [{ family }] });
    }

    const first = await search("?_count=2&gender=female");
    expect(first.body.total).toBe(5);
    expect(families(first.body)).toEqual(["A", "B"]);
    expect(linkTo(first.body, "previous")).toBeUndefined();
    expect(linkTo(first.body, "last")).toBe(`${BASE}/Patient?gender=female&_count=2&_page=3`);

    // Follow "next" as a client would, keeping only the path and query.
    const next = new URL(linkTo(first.body, "next")!);
    const second = await search(next.search);
    expect(families(second.body)).toEqual(["C", "D"]);
    expect(linkTo(second.body, "previous")).toBe(`${BASE}/Patient?gender=female&_count=2&_page=1`);

    const last = await search("?_count=2&_page=3");
    expect(families(last.body)).toEqual(["E"]);
    expect(linkTo(last.body, "next")).toBeUndefined();
  });

  it("sorts with _sort, descending with a minus", async () => {
    await createTestPatient({ name: [{ family: "Old" }], birthDate: "1950" });
    await createTestPatient({ name: [{ family: "Young" }], birthDate: "2001-05-03" });

    expect(families((await search("?_sort=-birthdate")).body)).toEqual(["Young", "Old"]);
    expect(families((await search("?_sort=-family")).body)).toEqual(["Young", "Old"]);
  });

  it("returns only the total with _count=0 and caps big pages", async () => {
    await createTestPatient();

    const totalOnly = await search("?_count=0");
    const capped = await search("?_count=1000");

    expect(totalOnly.body.total).toBe(1);
    expect(totalOnly.body.entry).toEqual([]);
    expect(linkTo(capped.body, "self")).toContain("_count=50");
  });

  it("ignores unknown parameters unless the client asks for strict handling", async () => {
    await createTestPatient();

    const lenient = await search("?colour=blue");
    const strict = await search("?colour=blue").set("Prefer", "handling=strict");

    expect(lenient.status).toBe(200);
    expect(lenient.body.total).toBe(1);
    expect(linkTo(lenient.body, "self")).not.toContain("colour");
    expect(strict.status).toBe(400);
    expect(strict.body.issue[0].code).toBe("not-supported");
  });

  it("rejects invalid values with an OperationOutcome", async () => {
    for (const query of ["?_count=-1", "?_page=0", "?_sort=height", "?gender=f", "?active=yes"]) {
      const res = await search(query);
      expect(res.status, query).toBe(400);
      expect(res.body.resourceType).toBe("OperationOutcome");
    }
  });
});
