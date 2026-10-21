import type { ObservationDocument } from "../models/observation.model.js";
import type { Observation } from "./types.js";
import {
  interpretationConcept,
  loincConcept,
  quantity,
  VITAL_SIGNS,
  VITAL_SIGNS_PROFILE,
  vitalSignsCategory,
} from "./vital-signs.js";

/** The FHIR Observation a client sees for a stored one (vital signs profile). */
export const toFhirObservation = (observation: ObservationDocument): Observation => {
  const sign = VITAL_SIGNS[observation.code];
  if (!sign) throw new Error(`Stored observation with unsupported code ${observation.code}`);
  const { low, high } = observation.range;

  return {
    resourceType: "Observation",
    id: observation.id,
    meta: {
      versionId: String(observation.versionId),
      lastUpdated: observation.updatedAt.toISOString(),
      profile: [VITAL_SIGNS_PROFILE],
    },
    status: observation.status,
    category: vitalSignsCategory(),
    code: loincConcept(observation.code),
    subject: { reference: `Patient/${String(observation.patient)}` },
    effectiveDateTime: observation.effective.toISOString(),
    valueQuantity: quantity(observation.value, sign),
    interpretation: interpretationConcept(observation.interpretation),
    referenceRange: [{ low: quantity(low, sign), high: quantity(high, sign) }],
  };
};
