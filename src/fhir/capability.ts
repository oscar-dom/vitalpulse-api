import { env } from "../config/env.js";
import {
  OBSERVATION_INCLUDES,
  OBSERVATION_SEARCH_PARAMS,
} from "../services/observation-search.service.js";
import { PATIENT_SEARCH_PARAMS } from "../services/patient-search.service.js";
import { FHIR_JSON, FHIR_VERSION, type CapabilityStatement } from "./types.js";
import { VITAL_SIGNS_PROFILE } from "./vital-signs.js";

type Interaction = "read" | "vread" | "update" | "delete" | "create" | "search-type";
type SearchParamType = "token" | "reference" | "string" | "date";

// The interactions each resource supports. The routes and a test check against this
// list, so the statement says what the server really does.
export const SUPPORTED_INTERACTIONS: Record<"Patient" | "Observation", Interaction[]> = {
  Patient: ["create", "read", "vread", "update", "delete", "search-type"],
  Observation: ["create", "read", "vread", "update", "search-type"],
};

// Search parameters are described in text. Some are not standard R4 parameters
// (interpretation on Observation), so no canonical definition is claimed.
const searchParams = (
  params: readonly { name: string; type: SearchParamType; documentation: string }[],
) => params.map(({ name, type, documentation }) => ({ name, type, documentation }));

const interactions = (resourceType: keyof typeof SUPPORTED_INTERACTIONS) =>
  SUPPORTED_INTERACTIONS[resourceType].map((code) => ({ code }));

/**
 * What this server can do, as FHIR clients expect to read it from GET [base]/metadata:
 * FHIR version, formats, resources, interactions and search parameters.
 */
export const capabilityStatement = (): CapabilityStatement => ({
  resourceType: "CapabilityStatement",
  status: "active",
  date: new Date().toISOString(),
  publisher: "VitalPulse",
  kind: "instance",
  software: { name: "VitalPulse API" },
  implementation: {
    description: "FHIR R4 server for vital signs: patients and their observations",
    url: env.FHIR_BASE_URL,
  },
  fhirVersion: FHIR_VERSION,
  format: ["json", FHIR_JSON],
  rest: [
    {
      mode: "server",
      documentation:
        "Every interaction except this statement needs a Bearer token from POST /auth/login. Admins manage patients; any signed-in user records and corrects observations.",
      security: {
        cors: true,
        description: "Bearer JWT from POST /auth/login (Authorization: Bearer <token>).",
      },
      resource: [
        {
          type: "Patient",
          profile: "http://hl7.org/fhir/StructureDefinition/Patient",
          interaction: interactions("Patient"),
          versioning: "versioned",
          readHistory: true,
          updateCreate: false,
          conditionalCreate: false,
          conditionalUpdate: false,
          conditionalDelete: "not-supported",
          searchParam: searchParams(PATIENT_SEARCH_PARAMS),
        },
        {
          type: "Observation",
          profile: "http://hl7.org/fhir/StructureDefinition/Observation",
          supportedProfile: [VITAL_SIGNS_PROFILE],
          interaction: interactions("Observation"),
          versioning: "versioned",
          readHistory: true,
          updateCreate: false,
          conditionalCreate: false,
          conditionalUpdate: false,
          conditionalDelete: "not-supported",
          referencePolicy: ["literal", "local", "enforced"],
          searchInclude: OBSERVATION_INCLUDES,
          searchParam: searchParams(OBSERVATION_SEARCH_PARAMS),
        },
      ],
    },
  ],
});
