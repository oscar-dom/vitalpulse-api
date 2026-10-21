import request from "supertest";
import { app } from "../../src/app.js";
import { createUserWithToken } from "./helpers/auth.js";
import { useTestDatabase } from "./helpers/db.js";
import { createTestPatient, MRN_SYSTEM, patientResource } from "./helpers/factories.js";

useTestDatabase();

const BASE = "http://localhost:3000/fhir";
const FHIR_JSON = "application/fhir+json";

let admin: string;
let clinician: string;

beforeEach(async () => {
  admin = (await createUserWithToken("admin")).auth;
  clinician = (await createUserWithToken("clinician")).auth;
});

const post = (body: object, auth = admin) =>
  request(app)
    .post("/fhir/Patient")
    .set("Authorization", auth)
    .set("Content-Type", FHIR_JSON)
    .send(JSON.stringify(body));

const put = (id: string, body: object, auth = admin) =>
  request(app)
    .put(`/fhir/Patient/${id}`)
    .set("Authorization", auth)
    .set("Content-Type", FHIR_JSON)
    .send(JSON.stringify(body));

describe("POST /fhir/Patient (create)", () => {
  it("creates the patient with server-assigned id and meta", async () => {
    const res = await post({ ...patientResource(), id: "my-own-id", meta: { versionId: "9" } });

    expect(res.status).toBe(201);
    expect(res.headers["content-type"]).toContain(FHIR_JSON);
    expect(res.body.id).toMatch(/^[a-f\d]{24}$/);
    expect(res.body.meta.versionId).toBe("1");
    expect(res.headers.location).toBe(`${BASE}/Patient/${res.body.id}/_history/1`);
    expect(res.headers.etag).toBe('W/"1"');
    expect(res.headers["last-modified"]).toBeDefined();
    expect(res.body).toMatchObject({
      resourceType: "Patient",
      active: true,
      name: [{ use: "official", family: "Doe", given: ["Jane"] }],
      gender: "female",
      birthDate: "1980-04-12",
    });
    expect(res.body).not.toHaveProperty("_id");
    expect(res.body).not.toHaveProperty("deleted");
  });

  it("accepts plain application/json too", async () => {
    const res = await request(app)
      .post("/fhir/Patient")
      .set("Authorization", admin)
      .send(patientResource());

    expect(res.status).toBe(201);
  });

  it("rejects elements the server does not support instead of dropping them", async () => {
    const res = await post({ ...patientResource(), maritalStatus: { text: "Married" } });

    expect(res.status).toBe(400);
    expect(res.body.issue[0].diagnostics).toContain("maritalStatus");
  });

  it("reports every invalid element with its expression", async () => {
    const res = await post({
      resourceType: "Patient",
      identifier: [],
      name: [{ use: "official" }],
      gender: "f",
      birthDate: "2999-01-01",
    });

    expect(res.status).toBe(400);
    const expressions = res.body.issue.flatMap(
      (issue: { expression: string[] }) => issue.expression,
    );
    expect(expressions).toEqual(
      expect.arrayContaining([
        "Patient.identifier",
        "Patient.name[0]",
        "Patient.gender",
        "Patient.birthDate",
      ]),
    );
  });

  it("rejects a body of another resource type", async () => {
    const res = await post({ ...patientResource(), resourceType: "Observation" });

    expect(res.status).toBe(400);
    expect(res.body.issue[0].expression).toEqual(["Patient.resourceType"]);
  });

  it("responds 409 duplicate when another patient has the identifier", async () => {
    const first = patientResource();
    await post(first);
    const res = await post({ ...patientResource(), identifier: first.identifier });

    expect(res.status).toBe(409);
    expect(res.body.issue[0].code).toBe("duplicate");
  });

  it("responds 403 forbidden to a clinician", async () => {
    const res = await post(patientResource(), clinician);

    expect(res.status).toBe(403);
    expect(res.body.issue[0].code).toBe("forbidden");
  });

  it("responds 401 without a token", async () => {
    const res = await request(app).post("/fhir/Patient").send(patientResource());

    expect(res.status).toBe(401);
  });
});

describe("GET /fhir/Patient/{id} (read)", () => {
  it("returns the patient to any signed-in user", async () => {
    const patient = await createTestPatient();
    const res = await request(app)
      .get(`/fhir/Patient/${patient.id}`)
      .set("Authorization", clinician);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(patient.id);
    expect(res.headers.etag).toBe('W/"1"');
  });

  it("responds 404 for an unknown id, valid or not", async () => {
    for (const id of ["507f1f77bcf86cd799439011", "not-one-of-ours"]) {
      const res = await request(app).get(`/fhir/Patient/${id}`).set("Authorization", clinician);
      expect(res.status).toBe(404);
      expect(res.body.issue[0].code).toBe("not-found");
    }
  });
});

describe("PUT /fhir/Patient/{id} (update)", () => {
  it("replaces the patient and bumps the version", async () => {
    const patient = await createTestPatient();
    const { gender: _gender, ...withoutGender } = patientResource({
      identifier: [{ system: MRN_SYSTEM, value: "NEW-1" }],
      name: [{ family: "Roe", given: ["Janet"] }],
    });

    const res = await put(patient.id, { ...withoutGender, id: patient.id });

    expect(res.status).toBe(200);
    expect(res.body.meta.versionId).toBe("2");
    expect(res.headers.etag).toBe('W/"2"');
    expect(res.headers.location).toBe(`${BASE}/Patient/${patient.id}/_history/2`);
    expect(res.body.name).toEqual([{ family: "Roe", given: ["Janet"] }]);
    // Full replacement: an element left out is gone.
    expect(res.body).not.toHaveProperty("gender");
  });

  it("honours If-Match and answers 412 for a stale version", async () => {
    const patient = await createTestPatient();
    const body = { ...patientResource(), id: patient.id };

    const ok = await put(patient.id, body).set("If-Match", 'W/"1"');
    const stale = await put(patient.id, body).set("If-Match", 'W/"1"');

    expect(ok.status).toBe(200);
    expect(stale.status).toBe(412);
    expect(stale.body.issue[0].code).toBe("conflict");
  });

  it("responds 400 when the body id is missing or differs from the URL", async () => {
    const patient = await createTestPatient();

    const missing = await put(patient.id, patientResource());
    const other = await put(patient.id, { ...patientResource(), id: "507f1f77bcf86cd799439011" });

    expect(missing.status).toBe(400);
    expect(other.status).toBe(400);
    expect(other.body.issue[0].expression).toEqual(["Patient.id"]);
  });

  it("responds 405 for an id that does not exist (no client-defined ids)", async () => {
    const id = "507f1f77bcf86cd799439011";
    const res = await put(id, { ...patientResource(), id });

    expect(res.status).toBe(405);
  });

  it("responds 403 to a clinician", async () => {
    const patient = await createTestPatient();
    const res = await put(patient.id, { ...patientResource(), id: patient.id }, clinician);

    expect(res.status).toBe(403);
  });
});

describe("DELETE /fhir/Patient/{id}", () => {
  it("deletes the patient: reads answer 410 Gone and deleting again is fine", async () => {
    const patient = await createTestPatient();
    const url = `/fhir/Patient/${patient.id}`;

    const deleted = await request(app).delete(url).set("Authorization", admin);
    const read = await request(app).get(url).set("Authorization", admin);
    const again = await request(app).delete(url).set("Authorization", admin);

    expect(deleted.status).toBe(204);
    expect(read.status).toBe(410);
    expect(read.body.issue[0].code).toBe("deleted");
    expect(again.status).toBe(204);
  });

  it("frees the identifier of a deleted patient", async () => {
    const body = patientResource();
    const created = await post(body);
    await request(app).delete(`/fhir/Patient/${created.body.id}`).set("Authorization", admin);

    const res = await post(body);

    expect(res.status).toBe(201);
  });

  it("responds 404 for an unknown patient and 403 to a clinician", async () => {
    const patient = await createTestPatient();

    const unknown = await request(app)
      .delete("/fhir/Patient/507f1f77bcf86cd799439011")
      .set("Authorization", admin);
    const forbidden = await request(app)
      .delete(`/fhir/Patient/${patient.id}`)
      .set("Authorization", clinician);

    expect(unknown.status).toBe(404);
    expect(forbidden.status).toBe(403);
  });
});

describe("GET /fhir/Patient/{id}/_history/{vid} (vread)", () => {
  it("returns any past version exactly as it was", async () => {
    const created = await post(patientResource({ name: [{ family: "First" }] }));
    const id = created.body.id as string;
    await put(id, { ...patientResource({ name: [{ family: "Second" }] }), id });
    await request(app).delete(`/fhir/Patient/${id}`).set("Authorization", admin);

    const v1 = await request(app).get(`/fhir/Patient/${id}/_history/1`).set("Authorization", admin);
    const v2 = await request(app).get(`/fhir/Patient/${id}/_history/2`).set("Authorization", admin);
    const v3 = await request(app).get(`/fhir/Patient/${id}/_history/3`).set("Authorization", admin);
    const v4 = await request(app).get(`/fhir/Patient/${id}/_history/4`).set("Authorization", admin);

    expect(v1.status).toBe(200);
    expect(v1.body).toEqual(created.body);
    expect(v1.headers.etag).toBe('W/"1"');
    expect(v2.body.name).toEqual([{ family: "Second" }]);
    expect(v3.status).toBe(410);
    expect(v4.status).toBe(404);
  });
});

describe("FHIR routing", () => {
  it("responds 405 with Allow for an unsupported method", async () => {
    const patient = await createTestPatient();
    const res = await request(app)
      .patch(`/fhir/Patient/${patient.id}`)
      .set("Authorization", admin)
      .send({});

    expect(res.status).toBe(405);
    expect(res.headers.allow).toBe("GET, PUT, DELETE");
  });

  it("responds 404 not-supported for a resource type the server does not implement", async () => {
    const res = await request(app).get("/fhir/Encounter").set("Authorization", admin);

    expect(res.status).toBe(404);
    expect(res.body.issue[0].code).toBe("not-supported");
  });
});
