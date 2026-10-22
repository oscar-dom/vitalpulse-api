import type { Observation, Patient } from "../../../src/fhir/types.js";
import { observationSchema } from "../../../src/schemas/observation.schema.js";
import { patientSchema } from "../../../src/schemas/patient.schema.js";
import { createObservation } from "../../../src/services/observations.service.js";
import { createPatient } from "../../../src/services/patients.service.js";

export const MRN_SYSTEM = "https://hospital.example.org/mrn";

let counter = 0;

/** A valid FHIR Patient body, unique on every call. */
export const patientResource = (overrides: Partial<Patient> = {}): Patient => {
  counter += 1;
  return {
    resourceType: "Patient",
    identifier: [{ system: MRN_SYSTEM, value: `MRN-${String(counter).padStart(4, "0")}` }],
    active: true,
    name: [{ use: "official", family: "Doe", given: ["Jane"] }],
    gender: "female",
    birthDate: "1980-04-12",
    ...overrides,
  };
};

/** Creates a patient through the service (with its history), skipping HTTP. */
export const createTestPatient = (overrides: Partial<Patient> = {}) =>
  createPatient(patientSchema.parse(patientResource(overrides)));

/** A valid vital-sign Observation body for a patient: heart rate 72 /min by default. */
export const observationResource = (
  patientId: string,
  overrides: Partial<Observation> = {},
): Observation => ({
  resourceType: "Observation",
  status: "final",
  category: [
    {
      coding: [
        {
          system: "http://terminology.hl7.org/CodeSystem/observation-category",
          code: "vital-signs",
        },
      ],
    },
  ],
  code: { coding: [{ system: "http://loinc.org", code: "8867-4", display: "Heart rate" }] },
  subject: { reference: `Patient/${patientId}` },
  effectiveDateTime: "2026-10-01T08:30:00Z",
  valueQuantity: {
    value: 72,
    unit: "beats/minute",
    system: "http://unitsofmeasure.org",
    code: "/min",
  },
  ...overrides,
});

/** Creates an observation through the service, skipping HTTP. */
export const createTestObservation = (patientId: string, overrides: Partial<Observation> = {}) =>
  createObservation(observationSchema.parse(observationResource(patientId, overrides)));
