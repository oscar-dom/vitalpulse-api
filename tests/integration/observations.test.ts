import request from "supertest";
import { app } from "../../src/app.js";
import { createUserWithToken } from "./helpers/auth.js";
import { useTestDatabase } from "./helpers/db.js";
import {
  createTestObservation,
  createTestPatient,
  observationResource,
} from "./helpers/factories.js";

useTestDatabase();

const BASE = "http://localhost:3000/fhir";
const INTERPRETATION = "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation";

let auth: string;
let admin: string;
let patientId: string;

beforeEach(async () => {
  auth = (await createUserWithToken("clinician")).auth;
  admin = (await createUserWithToken("admin")).auth;
  patientId = (await createTestPatient()).id;
});

const post = (body: object) =>
  request(app)
    .post("/fhir/Observation")
    .set("Authorization", auth)
    .set("Content-Type", "application/fhir+json")
    .send(JSON.stringify(body));

const put = (id: string, body: object) =>
  request(app)
    .put(`/fhir/Observation/${id}`)
    .set("Authorization", auth)
    .set("Content-Type", "application/fhir+json")
    .send(JSON.stringify(body));

const heartRate = (value: number) => observationResource(patientId, { valueQuantity: { value } });

const interpretationOf = (res: { body: { interpretation: { coding: { code: string }[] }[] } }) =>
  res.body.interpretation[0]!.coding[0]!.code;

describe("POST /fhir/Observation (create)", () => {
  it("stores the observation and the server interprets the value", async () => {
    const res = await post(heartRate(120));

    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`${BASE}/Observation/${res.body.id}/_history/1`);
    expect(res.body).toEqual({
      resourceType: "Observation",
      id: expect.stringMatching(/^[a-f\d]{24}$/),
      meta: {
        versionId: "1",
        lastUpdated: expect.any(String),
        profile: ["http://hl7.org/fhir/StructureDefinition/vitalsigns"],
      },
      status: "final",
      category: [
        {
          coding: [
            {
              system: "http://terminology.hl7.org/CodeSystem/observation-category",
              code: "vital-signs",
              display: "Vital Signs",
            },
          ],
          text: "Vital Signs",
        },
      ],
      code: {
        coding: [{ system: "http://loinc.org", code: "8867-4", display: "Heart rate" }],
        text: "Heart rate",
      },
      subject: { reference: `Patient/${patientId}` },
      effectiveDateTime: "2026-10-01T08:30:00.000Z",
      // The unit was not sent: the server takes it from the LOINC code.
      valueQuantity: {
        value: 120,
        unit: "beats/minute",
        system: "http://unitsofmeasure.org",
        code: "/min",
      },
      interpretation: [
        { coding: [{ system: INTERPRETATION, code: "H", display: "High" }], text: "High" },
      ],
      referenceRange: [
        {
          low: {
            value: 60,
            unit: "beats/minute",
            system: "http://unitsofmeasure.org",
            code: "/min",
          },
          high: {
            value: 100,
            unit: "beats/minute",
            system: "http://unitsofmeasure.org",
            code: "/min",
          },
        },
      ],
    });
  });

  it.each([
    [100, "N"],
    [39, "LL"],
    [140, "HH"],
  ])("interprets heart rate %s as %s", async (value, expected) => {
    const res = await post(heartRate(value));

    expect(interpretationOf(res)).toBe(expected);
  });

  it("works for every supported vital sign", async () => {
    const temperature = await post(
      observationResource(patientId, {
        code: { coding: [{ system: "http://loinc.org", code: "8310-5" }] },
        valueQuantity: { value: 38.4, code: "Cel" },
      }),
    );
    const spo2 = await post(
      observationResource(patientId, {
        code: { coding: [{ system: "http://loinc.org", code: "2708-6" }] },
        valueQuantity: { value: 88, unit: "%" },
      }),
    );

    expect(temperature.status).toBe(201);
    expect(temperature.body.valueQuantity.unit).toBe("°C");
    expect(interpretationOf(temperature)).toBe("H");
    expect(interpretationOf(spo2)).toBe("LL");
  });

  it("refuses an interpretation or range sent by the client", async () => {
    const res = await post({
      ...heartRate(150),
      interpretation: [{ coding: [{ system: INTERPRETATION, code: "N" }] }],
    });

    expect(res.status).toBe(400);
    expect(res.body.issue[0].expression).toEqual(["Observation.interpretation"]);
    expect(res.body.issue[0].diagnostics).toContain("calculated by the server");
  });

  it.each([
    [
      "an unsupported LOINC code",
      { code: { coding: [{ system: "http://loinc.org", code: "2339-0" }] } },
      "Observation.code",
    ],
    [
      "a unit that does not match the vital sign",
      {
        code: { coding: [{ system: "http://loinc.org", code: "8310-5" }] },
        valueQuantity: { value: 101, code: "[degF]" },
      },
      "Observation.valueQuantity.code",
    ],
    ["an impossible value", { valueQuantity: { value: 900 } }, "Observation.valueQuantity.value"],
    ["a correction status", { status: "entered-in-error" as const }, "Observation.status"],
    [
      "another category",
      { category: [{ coding: [{ code: "laboratory" }] }] },
      "Observation.category",
    ],
  ])("responds 422 for %s", async (_case, overrides, expression) => {
    const res = await post(observationResource(patientId, overrides));

    expect(res.status).toBe(422);
    expect(res.body.issue[0]).toMatchObject({ code: "business-rule", expression: [expression] });
  });

  it("responds 422 when the patient does not exist, was deleted or is inactive", async () => {
    const deleted = await createTestPatient();
    await request(app).delete(`/fhir/Patient/${deleted.id}`).set("Authorization", admin);
    const inactive = await createTestPatient({ active: false });

    for (const id of ["507f1f77bcf86cd799439011", deleted.id, inactive.id]) {
      const res = await post(observationResource(id));
      expect(res.status).toBe(422);
      expect(res.body.issue[0].expression).toEqual(["Observation.subject"]);
    }
  });

  it("responds 400 for a malformed reference or dateTime", async () => {
    for (const overrides of [
      { subject: { reference: "Practitioner/1" } },
      { effectiveDateTime: "2026-10-01T08:30:00" }, // no time zone
      { effectiveDateTime: "2999-01-01T00:00:00Z" }, // future
    ]) {
      const res = await post(observationResource(patientId, overrides));
      expect(res.status).toBe(400);
    }
  });
});

describe("GET /fhir/Observation/{id} (read)", () => {
  it("returns the observation, or 404", async () => {
    const observation = await createTestObservation(patientId);

    const found = await request(app)
      .get(`/fhir/Observation/${observation.id}`)
      .set("Authorization", auth);
    const missing = await request(app)
      .get("/fhir/Observation/507f1f77bcf86cd799439011")
      .set("Authorization", auth);

    expect(found.status).toBe(200);
    expect(found.body.id).toBe(observation.id);
    expect(missing.status).toBe(404);
  });
});

describe("PUT /fhir/Observation/{id} (correct)", () => {
  it("amends the value, interprets it again and keeps the old version", async () => {
    const observation = await createTestObservation(patientId, { valueQuantity: { value: 180 } });

    const res = await put(observation.id, {
      ...heartRate(80),
      id: observation.id,
      status: "amended",
    });

    expect(res.status).toBe(200);
    expect(res.body.meta.versionId).toBe("2");
    expect(res.body.status).toBe("amended");
    expect(interpretationOf(res)).toBe("N");

    const v1 = await request(app)
      .get(`/fhir/Observation/${observation.id}/_history/1`)
      .set("Authorization", auth);
    expect(v1.body.valueQuantity.value).toBe(180);
    expect(interpretationOf(v1)).toBe("HH");
  });

  it("marks a mistake as entered-in-error instead of deleting it", async () => {
    const observation = await createTestObservation(patientId);

    const res = await put(observation.id, {
      ...heartRate(72),
      id: observation.id,
      status: "entered-in-error",
    });
    const remove = await request(app)
      .delete(`/fhir/Observation/${observation.id}`)
      .set("Authorization", admin);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("entered-in-error");
    expect(remove.status).toBe(405);
    expect(remove.headers.allow).toBe("GET, PUT");
  });

  it("does not move an observation to another patient", async () => {
    const observation = await createTestObservation(patientId);
    const other = await createTestPatient();

    const res = await put(observation.id, {
      ...observationResource(other.id),
      id: observation.id,
    });

    expect(res.status).toBe(422);
    expect(res.body.issue[0].expression).toEqual(["Observation.subject"]);
  });

  it("answers 412 for a stale If-Match", async () => {
    const observation = await createTestObservation(patientId);
    const body = { ...heartRate(75), id: observation.id };

    await put(observation.id, body);
    const stale = await put(observation.id, body).set("If-Match", 'W/"1"');

    expect(stale.status).toBe(412);
  });
});

describe("Deleting a patient with observations", () => {
  it("is refused with 409 conflict", async () => {
    await createTestObservation(patientId);

    const res = await request(app).delete(`/fhir/Patient/${patientId}`).set("Authorization", admin);

    expect(res.status).toBe(409);
    expect(res.body.issue[0].code).toBe("conflict");
  });
});
