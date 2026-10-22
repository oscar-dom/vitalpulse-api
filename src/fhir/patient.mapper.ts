import type { Patient as StoredPatient, PatientDocument } from "../models/patient.model.js";
import type { PatientInput } from "../schemas/patient.schema.js";
import type { Patient } from "./types.js";

/** The fields to store for a validated FHIR Patient. id and meta are the server's. */
export const toPatientFields = (input: PatientInput) =>
  ({
    identifiers: input.identifier.map(({ system, value }) => ({ system, value })),
    active: input.active,
    names: input.name.map(({ use, family, given }) => ({ use, family, given: given ?? [] })),
    gender: input.gender,
    birthDate: input.birthDate,
  }) satisfies Partial<StoredPatient>;

/** The FHIR Patient a client sees for a stored patient. */
export const toFhirPatient = (patient: PatientDocument): Patient => ({
  resourceType: "Patient",
  id: patient.id,
  meta: {
    versionId: String(patient.versionId),
    lastUpdated: patient.updatedAt.toISOString(),
  },
  identifier: patient.identifiers.map(({ system, value }) => ({ system, value })),
  active: patient.active,
  name: patient.names.map(({ use, family, given }) => ({
    ...(use && { use }),
    ...(family && { family }),
    ...(given.length > 0 && { given: [...given] }),
  })),
  ...(patient.gender && { gender: patient.gender }),
  ...(patient.birthDate && { birthDate: patient.birthDate }),
});
