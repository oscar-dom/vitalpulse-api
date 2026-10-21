// FHIR R4 (4.0.1) resource types from @types/fhir, re-exported from one place so the
// rest of the code does not depend on the package layout.
export type {
  Bundle,
  BundleEntry,
  BundleLink,
  CapabilityStatement,
  CodeableConcept,
  Coding,
  Identifier,
  Meta,
  Observation,
  ObservationReferenceRange,
  OperationOutcome,
  OperationOutcomeIssue,
  Patient,
  Quantity,
  Reference,
  Resource,
} from "fhir/r4.js";

export const FHIR_VERSION = "4.0.1";

// The FHIR media type. JSON is the only format this server speaks.
export const FHIR_JSON = "application/fhir+json";
