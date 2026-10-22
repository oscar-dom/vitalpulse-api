import request from "supertest";
import { app } from "../../src/app.js";
import { SUPPORTED_INTERACTIONS } from "../../src/fhir/capability.js";
import { createUserWithToken } from "./helpers/auth.js";
import { useTestDatabase } from "./helpers/db.js";

useTestDatabase();

type ResourceType = keyof typeof SUPPORTED_INTERACTIONS;
type SearchParam = { name: string; type: string };
type RestResource = { type: ResourceType; searchParam: SearchParam[]; interaction: object[] };

const ID = "507f1f77bcf86cd799439011";

// A valid example value for each declared search parameter.
const SAMPLE_VALUES: Record<string, string> = {
  _id: ID,
  identifier: "https://hospital.example.org/mrn|MRN-1",
  name: "doe",
  family: "doe",
  gender: "female",
  active: "true",
  patient: `Patient/${ID}`,
  subject: `Patient/${ID}`,
  code: "http://loinc.org|8867-4",
  interpretation: "H",
  status: "final",
  category: "vital-signs",
  date: "ge2026-10-01",
};

// How each FHIR interaction is reached.
const REQUESTS: Record<
  string,
  (type: string) => [method: "get" | "post" | "put" | "delete", path: string]
> = {
  create: (type) => ["post", `/fhir/${type}`],
  "search-type": (type) => ["get", `/fhir/${type}`],
  read: (type) => ["get", `/fhir/${type}/${ID}`],
  vread: (type) => ["get", `/fhir/${type}/${ID}/_history/1`],
  update: (type) => ["put", `/fhir/${type}/${ID}`],
  delete: (type) => ["delete", `/fhir/${type}/${ID}`],
};

const metadata = async () => (await request(app).get("/fhir/metadata")).body;

describe("GET /fhir/metadata", () => {
  it("is public and describes the server", async () => {
    const res = await request(app).get("/fhir/metadata");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/fhir+json");
    expect(res.body).toMatchObject({
      resourceType: "CapabilityStatement",
      status: "active",
      kind: "instance",
      fhirVersion: "4.0.1",
      format: expect.arrayContaining(["json"]),
      implementation: { url: "http://localhost:3000/fhir" },
    });
    const types = res.body.rest[0].resource.map((resource: RestResource) => resource.type);
    expect(types).toEqual(["Patient", "Observation"]);
  });

  it("declares only search parameters the server really accepts", async () => {
    const { auth } = await createUserWithToken("admin");
    const resources: RestResource[] = (await metadata()).rest[0].resource;

    for (const { type, searchParam } of resources) {
      for (const { name } of searchParam) {
        const value = SAMPLE_VALUES[name];
        expect(value, `sample value for ${type}?${name}`).toBeDefined();

        // Strict handling turns an unknown parameter into a 400.
        const res = await request(app)
          .get(`/fhir/${type}`)
          .query({ [name]: value })
          .set("Prefer", "handling=strict")
          .set("Authorization", auth);
        expect(res.status, `${type}?${name}=${value}`).toBe(200);
      }
    }
  });

  it("declares exactly the interactions the routes support", async () => {
    const { auth } = await createUserWithToken("admin");
    const resources: RestResource[] = (await metadata()).rest[0].resource;

    for (const { type } of resources) {
      for (const [interaction, target] of Object.entries(REQUESTS)) {
        const [method, path] = target(type);
        const res = await request(app)[method](path).set("Authorization", auth).send({});
        const declared = SUPPORTED_INTERACTIONS[type].includes(interaction as never);

        if (declared) expect(res.status, `${type} ${interaction}`).not.toBe(405);
        else expect(res.status, `${type} ${interaction}`).toBe(405);
      }
    }
  });
});
