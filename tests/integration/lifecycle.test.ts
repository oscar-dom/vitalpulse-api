import request from "supertest";
import { app } from "../../src/app.js";
import { ensureAdmin } from "../../src/services/admin.service.js";
import { useTestDatabase } from "./helpers/db.js";

useTestDatabase();

const FHIR_JSON = "application/fhir+json";
const MRN = "https://hospital.example.org/mrn";

const fhir = (
  method: "get" | "post" | "put" | "delete",
  path: string,
  auth: string,
  body?: object,
) => {
  const req = request(app)[method](path).set("Authorization", auth).set("Accept", FHIR_JSON);
  return body ? req.set("Content-Type", FHIR_JSON).send(JSON.stringify(body)) : req;
};

// End-to-end flow through the real endpoints, as a client would use them. Only the
// first admin is seeded (as npm run seed:admin does); everything else is HTTP.
describe("Patient lifecycle", () => {
  it("goes from creation to deletion, with observations along the way", async () => {
    // Accounts: the seeded admin logs in; a clinician signs up.
    await ensureAdmin({ name: "Root", email: "root@example.com", password: "root-secret-123" });
    const adminLogin = await request(app)
      .post("/auth/login")
      .send({ email: "root@example.com", password: "root-secret-123" });
    const admin = `Bearer ${adminLogin.body.token}`;

    const signUp = await request(app).post("/auth/register").send({
      name: "Grace Hopper",
      email: "grace@example.com",
      password: "grace-secret-123",
    });
    expect(signUp.status).toBe(201);
    const clinician = `Bearer ${signUp.body.token}`;

    // Create (admin)
    const created = await fhir("post", "/fhir/Patient", admin, {
      resourceType: "Patient",
      identifier: [{ system: MRN, value: "MRN-7" }],
      name: [{ family: "Lovelace", given: ["Ada"] }],
      gender: "female",
      birthDate: "1985-12-10",
    });
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    const url = `/fhir/Patient/${id}`;

    // Read (clinician)
    const read = await fhir("get", url, clinician);
    expect(read.status).toBe(200);
    expect(read.body.name[0].family).toBe("Lovelace");

    // Update (admin), with the ETag just read
    const updated = await fhir("put", url, admin, {
      ...read.body,
      name: [{ family: "King", given: ["Ada", "Augusta"] }],
    }).set("If-Match", read.headers.etag as string);
    expect(updated.status).toBe(200);
    expect(updated.body.meta.versionId).toBe("2");

    // Search (clinician)
    const found = await fhir("get", `/fhir/Patient?identifier=${MRN}|MRN-7`, clinician);
    expect(found.body.total).toBe(1);
    expect(found.body.entry[0].resource.name[0].family).toBe("King");

    // The clinician records a high heart rate; the server flags it.
    const observation = await fhir("post", "/fhir/Observation", clinician, {
      resourceType: "Observation",
      status: "final",
      code: { coding: [{ system: "http://loinc.org", code: "8867-4" }] },
      subject: { reference: `Patient/${id}` },
      effectiveDateTime: "2026-10-21T08:30:00Z",
      valueQuantity: { value: 118 },
    });
    expect(observation.status).toBe(201);
    expect(observation.body.interpretation[0].coding[0].code).toBe("H");

    // A patient with observations cannot be deleted; deactivate instead.
    const refused = await fhir("delete", url, admin);
    expect(refused.status).toBe(409);
    const deactivated = await fhir("put", url, admin, { ...updated.body, active: false });
    expect(deactivated.body.active).toBe(false);

    // The clinician is not allowed to delete; a patient without observations can be.
    const temporary = await fhir("post", "/fhir/Patient", admin, {
      resourceType: "Patient",
      identifier: [{ system: MRN, value: "MRN-8" }],
      name: [{ family: "Temp" }],
    });
    const tempUrl = `/fhir/Patient/${temporary.body.id}`;
    expect((await fhir("delete", tempUrl, clinician)).status).toBe(403);
    expect((await fhir("delete", tempUrl, admin)).status).toBe(204);
    expect((await fhir("get", tempUrl, clinician)).status).toBe(410);
  });
});
