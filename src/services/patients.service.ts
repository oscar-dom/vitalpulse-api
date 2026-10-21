import { mongo } from "mongoose";
import { AppError, GoneError, NotFoundError } from "../errors/app.error.js";
import { toFhirPatient, toPatientFields } from "../fhir/patient.mapper.js";
import { ObservationModel } from "../models/observation.model.js";
import { PatientModel, type PatientDocument } from "../models/patient.model.js";
import type { PatientInput } from "../schemas/patient.schema.js";
import { getVersion, recordVersion } from "./history.service.js";
import { isMongoId } from "./ids.service.js";

const DUPLICATE_KEY = 11000;

const duplicateIdentifier = (): AppError =>
  new AppError("Another patient already has one of these identifiers.", 409, {
    code: "duplicate",
    expression: ["Patient.identifier"],
  });

/** 409 if a living patient other than `exceptId` already has one of the identifiers. */
const assertIdentifiersFree = async (identifierKeys: string[], exceptId?: string) => {
  const taken = await PatientModel.exists({
    identifierKeys: { $in: identifierKeys },
    deleted: false,
    ...(exceptId && { _id: { $ne: exceptId } }),
  });
  if (taken) throw duplicateIdentifier();
};

/** Two writes at once with the same identifier: the unique index catches the second. */
const rethrowDuplicate = (error: unknown): never => {
  if (error instanceof mongo.MongoServerError && error.code === DUPLICATE_KEY) {
    throw duplicateIdentifier();
  }
  throw error;
};

/** 412 when the client edits a version that is no longer the current one. */
const assertVersion = (patient: PatientDocument, expected: number | undefined) => {
  if (expected !== undefined && expected !== patient.versionId) {
    throw new AppError(
      `Version conflict: If-Match asks for version ${expected}, but the current version is ${patient.versionId}.`,
      412,
    );
  }
};

/**
 * The stored patient behind an id, including deleted ones. A string that cannot be one
 * of our ids is simply a patient that does not exist.
 */
const findAnyPatient = async (id: string) =>
  isMongoId(id) ? PatientModel.findById(id) : Promise.resolve(null);

/** A living patient: 404 if it never existed, 410 if it was deleted. */
export const getPatient = async (id: string): Promise<PatientDocument> => {
  const patient = await findAnyPatient(id);
  if (!patient) throw new NotFoundError("Patient", id);
  if (patient.deleted) throw new GoneError("Patient", id);
  return patient;
};

export const createPatient = async (input: PatientInput): Promise<PatientDocument> => {
  const fields = toPatientFields(input);
  await assertIdentifiersFree(fields.identifierKeys);

  const patient = await PatientModel.create(fields).catch(rethrowDuplicate);
  await recordVersion("Patient", patient._id, 1, patient.updatedAt, toFhirPatient(patient));
  return patient;
};

/**
 * Replaces a patient with a new version (FHIR update is a full replacement). The id in
 * the body must match the URL. The server does not let clients pick ids, so an
 * update of an unknown id is a 405 rather than a create.
 */
export const updatePatient = async (
  id: string,
  input: PatientInput,
  ifMatch: number | undefined,
): Promise<PatientDocument> => {
  if (input.id !== id) {
    throw new AppError(
      input.id === undefined
        ? "The resource must include its id, the same as in the URL."
        : `The id in the body (${input.id}) does not match the id in the URL (${id}).`,
      400,
      { expression: ["Patient.id"] },
    );
  }

  const patient = await findAnyPatient(id);
  if (!patient) {
    throw new AppError(
      `Patient/${id} does not exist and this server does not allow client-defined ids. Create it with POST /Patient.`,
      405,
    );
  }
  if (patient.deleted) throw new GoneError("Patient", id);
  assertVersion(patient, ifMatch);

  const fields = toPatientFields(input);
  await assertIdentifiersFree(fields.identifierKeys, id);

  // Only applies if nobody saved another version since we read it.
  const updated = await PatientModel.findOneAndUpdate(
    { _id: patient._id, versionId: patient.versionId, deleted: false },
    { ...replacement(fields), $inc: { versionId: 1 } },
    { returnDocument: "after", runValidators: true },
  ).catch(rethrowDuplicate);
  if (!updated) {
    throw new AppError(
      "The patient changed while it was being updated. Read it and try again.",
      412,
    );
  }

  await recordVersion(
    "Patient",
    updated._id,
    updated.versionId,
    updated.updatedAt,
    toFhirPatient(updated),
  );
  return updated;
};

/**
 * A full replacement as a MongoDB update: elements present are set, and optional
 * elements left out of the new version are removed from the stored patient.
 */
const replacement = (fields: Record<string, unknown>) => {
  const entries = Object.entries(fields);
  return {
    $set: Object.fromEntries(entries.filter(([, value]) => value !== undefined)),
    $unset: Object.fromEntries(
      entries.filter(([, value]) => value === undefined).map(([key]) => [key, ""]),
    ),
  };
};

/**
 * Deletes a patient. It is kept as deleted, so reading it answers 410 Gone and its
 * history stays. Deleting an already deleted patient succeeds again (FHIR delete is
 * idempotent). A patient with observations cannot be deleted: they would point to
 * nobody, and clinical data is not thrown away. Set active to false instead.
 */
export const deletePatient = async (id: string, ifMatch: number | undefined): Promise<void> => {
  const patient = await findAnyPatient(id);
  if (!patient) throw new NotFoundError("Patient", id);
  if (patient.deleted) return;
  assertVersion(patient, ifMatch);

  if (await ObservationModel.exists({ patient: patient._id })) {
    throw new AppError(
      `Patient/${id} has observations and cannot be deleted. Update it with active: false instead.`,
      409,
    );
  }

  patient.deleted = true;
  patient.versionId += 1;
  await patient.save();
  await recordVersion("Patient", patient._id, patient.versionId, patient.updatedAt);
};

/** A past version of a patient (vread). */
export const getPatientVersion = async (id: string, versionId: string) => {
  const patient = await findAnyPatient(id);
  if (!patient) throw new NotFoundError("Patient", id);
  return getVersion("Patient", id, versionId);
};
