import { type HydratedDocument, model, Schema } from "mongoose";
import { GENDERS, NAME_USES } from "../schemas/patient.schema.js";

// What the database stores for a patient. It is close to the FHIR Patient, but not
// the same document: src/fhir/patient.mapper.ts turns one into the other, so storage
// details (Mongo ids, version counter, soft delete) never reach the client.

export interface PatientIdentifier {
  system: string;
  value: string;
}

export interface PatientName {
  use?: (typeof NAME_USES)[number];
  family?: string;
  given: string[];
}

export interface Patient {
  identifiers: PatientIdentifier[];
  active: boolean;
  names: PatientName[];
  gender?: (typeof GENDERS)[number];
  // Kept as the FHIR text (YYYY, YYYY-MM or YYYY-MM-DD) so a partial date stays partial.
  birthDate?: string;
  // meta.versionId: starts at 1 and goes up with every update and the delete.
  versionId: number;
  // Deleted patients are kept so a read answers 410 Gone instead of 404, as FHIR asks.
  deleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type PatientDocument = HydratedDocument<Patient>;

const identifierSchema = new Schema<PatientIdentifier>(
  {
    system: { type: String, required: true, trim: true },
    value: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const nameSchema = new Schema<PatientName>(
  {
    use: { type: String, enum: NAME_USES },
    family: { type: String, trim: true },
    given: { type: [String], default: [] },
  },
  { _id: false },
);

const patientSchema = new Schema<Patient>(
  {
    identifiers: {
      type: [identifierSchema],
      validate: [
        (value: PatientIdentifier[]) => value.length > 0,
        "at least one identifier is required",
      ],
    },
    active: { type: Boolean, default: true },
    names: {
      type: [nameSchema],
      validate: [(value: PatientName[]) => value.length > 0, "at least one name is required"],
    },
    gender: { type: String, enum: GENDERS },
    birthDate: { type: String, match: /^\d{4}(-\d{2}(-\d{2})?)?$/ },
    versionId: { type: Number, required: true, default: 1, min: 1 },
    deleted: { type: Boolean, required: true, default: false },
  },
  { timestamps: true },
);

// An identifier (system + value) belongs to one living patient only. Deleted patients
// are left out, so their identifier can be reused. Both fields come from the same
// array, so MongoDB indexes each identifier as one pair: two patients only clash when
// they share a whole identifier, not a system of one and a value of another.
patientSchema.index(
  { "identifiers.system": 1, "identifiers.value": 1 },
  { unique: true, partialFilterExpression: { deleted: false } },
);
// Name searches and the default sort.
patientSchema.index({ "names.family": 1 });

export const PatientModel = model<Patient>("Patient", patientSchema);
