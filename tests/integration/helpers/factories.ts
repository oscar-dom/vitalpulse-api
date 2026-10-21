import type { Patient } from "../../../src/fhir/types.js";
import { patientSchema } from "../../../src/schemas/patient.schema.js";
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
