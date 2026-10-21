import { AppError, BusinessRuleError, NotFoundError } from "../errors/app.error.js";
import { toFhirObservation } from "../fhir/observation.mapper.js";
import {
  LOINC,
  OBSERVATION_CATEGORY,
  UCUM,
  VITAL_SIGN_CODES,
  VITAL_SIGNS,
  type VitalSign,
} from "../fhir/vital-signs.js";
import {
  type ObservationDocument,
  ObservationModel,
  type ObservationStatus,
} from "../models/observation.model.js";
import { PatientModel } from "../models/patient.model.js";
import type { ObservationInput } from "../schemas/observation.schema.js";
import { getVersion, recordVersion } from "./history.service.js";
import { isMongoId } from "./ids.service.js";
import { interpret } from "./interpretation.service.js";

// A new observation starts in one of these; the others describe what happened later.
const CREATE_STATUSES: ObservationStatus[] = ["registered", "preliminary", "final"];

/** The vital sign of the observation, from its LOINC coding. 422 if not supported. */
const vitalSignOf = (input: ObservationInput): { code: string; sign: VitalSign } => {
  const coding = input.code.coding.find(
    ({ system, code }) => system === LOINC && code !== undefined && code in VITAL_SIGNS,
  );
  if (!coding?.code) {
    throw new BusinessRuleError(
      `Observation.code needs a LOINC coding (system ${LOINC}) of a supported vital sign: ${VITAL_SIGN_CODES.join(", ")}.`,
      ["Observation.code"],
    );
  }
  return { code: coding.code, sign: VITAL_SIGNS[coding.code]! };
};

/** Category may be left out, but if sent it must say vital-signs. */
const assertVitalSignsCategory = (input: ObservationInput): void => {
  if (input.category === undefined) return;
  const isVitalSigns = input.category.some((concept) =>
    concept.coding.some(
      ({ system, code }) => system === OBSERVATION_CATEGORY && code === "vital-signs",
    ),
  );
  if (!isVitalSigns) {
    throw new BusinessRuleError("This server only stores vital-signs observations.", [
      "Observation.category",
    ]);
  }
};

/**
 * The unit comes from the LOINC code. The client may repeat it, but a different unit
 * (e.g. °F for a temperature in Cel) is rejected rather than stored wrongly. The value
 * must also be physically possible.
 */
const assertQuantity = (input: ObservationInput, sign: VitalSign): void => {
  const { value, system, code, unit } = input.valueQuantity;
  if (system !== undefined && system !== UCUM) {
    throw new BusinessRuleError(`valueQuantity.system must be UCUM (${UCUM}).`, [
      "Observation.valueQuantity.system",
    ]);
  }
  if (code !== undefined && code !== sign.ucum) {
    throw new BusinessRuleError(`${sign.display} is measured in "${sign.ucum}", not "${code}".`, [
      "Observation.valueQuantity.code",
    ]);
  }
  if (unit !== undefined && unit !== sign.unit && unit !== sign.ucum) {
    throw new BusinessRuleError(`${sign.display} is measured in "${sign.unit}", not "${unit}".`, [
      "Observation.valueQuantity.unit",
    ]);
  }
  const [min, max] = sign.plausible;
  if (value < min || value > max) {
    throw new BusinessRuleError(
      `${value} ${sign.ucum} is not a possible ${sign.display.toLowerCase()} (${min}-${max}).`,
      ["Observation.valueQuantity.value"],
    );
  }
};

/** The patient of Observation.subject: it must exist, be alive in the API and active. */
const subjectPatient = async (input: ObservationInput) => {
  const id = input.subject.reference.slice("Patient/".length);
  const patient = isMongoId(id) ? await PatientModel.findById(id) : null;
  if (!patient || patient.deleted) {
    throw new BusinessRuleError(`${input.subject.reference} does not exist.`, [
      "Observation.subject",
    ]);
  }
  if (!patient.active) {
    throw new BusinessRuleError(
      `${input.subject.reference} is inactive and does not accept new observations.`,
      ["Observation.subject"],
    );
  }
  return patient;
};

/** Everything the server works out from the client's data: range and interpretation. */
const judgedFields = (input: ObservationInput, sign: VitalSign) => {
  const { low, high, criticalLow, criticalHigh } = sign;
  const range = { low, high, criticalLow, ...(criticalHigh !== undefined && { criticalHigh }) };
  return {
    status: input.status,
    effective: input.effectiveDateTime,
    value: input.valueQuantity.value,
    range,
    interpretation: interpret(input.valueQuantity.value, range),
  };
};

export const createObservation = async (input: ObservationInput): Promise<ObservationDocument> => {
  if (!CREATE_STATUSES.includes(input.status)) {
    throw new BusinessRuleError(
      `A new observation must be ${CREATE_STATUSES.join(", ")}; "${input.status}" is for correcting an existing one.`,
      ["Observation.status"],
    );
  }
  assertVitalSignsCategory(input);
  const { code, sign } = vitalSignOf(input);
  assertQuantity(input, sign);
  const patient = await subjectPatient(input);

  const observation = await ObservationModel.create({
    ...judgedFields(input, sign),
    code,
    patient: patient._id,
  });
  await recordVersion(
    "Observation",
    observation._id,
    1,
    observation.updatedAt,
    toFhirObservation(observation),
  );
  return observation;
};

export const getObservation = async (id: string): Promise<ObservationDocument> => {
  const observation = isMongoId(id) ? await ObservationModel.findById(id) : null;
  if (!observation) throw new NotFoundError("Observation", id);
  return observation;
};

/**
 * Corrects an observation with a new version: a new value or a status such as amended
 * or entered-in-error. Observations are never deleted, so the record keeps every
 * mistake and its correction. Patient and vital sign cannot change: that would be a
 * different observation.
 */
export const updateObservation = async (
  id: string,
  input: ObservationInput,
  ifMatch: number | undefined,
): Promise<ObservationDocument> => {
  if (input.id !== id) {
    throw new AppError(
      input.id === undefined
        ? "The resource must include its id, the same as in the URL."
        : `The id in the body (${input.id}) does not match the id in the URL (${id}).`,
      400,
      { expression: ["Observation.id"] },
    );
  }

  const observation = isMongoId(id) ? await ObservationModel.findById(id) : null;
  if (!observation) {
    throw new AppError(
      `Observation/${id} does not exist and this server does not allow client-defined ids. Create it with POST /Observation.`,
      405,
    );
  }
  if (ifMatch !== undefined && ifMatch !== observation.versionId) {
    throw new AppError(
      `Version conflict: If-Match asks for version ${ifMatch}, but the current version is ${observation.versionId}.`,
      412,
    );
  }

  assertVitalSignsCategory(input);
  const { code, sign } = vitalSignOf(input);
  if (code !== observation.code) {
    throw new BusinessRuleError("The vital sign of an observation cannot change.", [
      "Observation.code",
    ]);
  }
  if (input.subject.reference !== `Patient/${String(observation.patient)}`) {
    throw new BusinessRuleError("An observation cannot be moved to another patient.", [
      "Observation.subject",
    ]);
  }
  assertQuantity(input, sign);

  const updated = await ObservationModel.findOneAndUpdate(
    { _id: observation._id, versionId: observation.versionId },
    { $set: judgedFields(input, sign), $inc: { versionId: 1 } },
    { new: true, runValidators: true },
  );
  if (!updated) {
    throw new AppError(
      "The observation changed while it was being updated. Read it and try again.",
      412,
    );
  }

  await recordVersion(
    "Observation",
    updated._id,
    updated.versionId,
    updated.updatedAt,
    toFhirObservation(updated),
  );
  return updated;
};

/** A past version of an observation (vread). */
export const getObservationVersion = async (id: string, versionId: string) => {
  await getObservation(id);
  return getVersion("Observation", id, versionId);
};
