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
  // "system|value" of each identifier (see identifierKey), written with them. A unique
  // index on it keeps identifiers unique, and identifier searches match it directly.
  identifierKeys: string[];
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
    identifierKeys: { type: [String], default: [] },
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

export const identifierKey = ({ system, value }: PatientIdentifier): string => `${system}|${value}`;

// An identifier (system + value) belongs to one living patient only. Deleted patients
// are left out, so their identifier can be reused. A compound index on
// identifiers.system + identifiers.value would not work: for arrays MongoDB indexes
// every system with every value, so two identifiers of one patient could clash with
// an unrelated patient.
patientSchema.index(
  { identifierKeys: 1 },
  { unique: true, partialFilterExpression: { deleted: false } },
);
// Name searches and the default sort.
patientSchema.index({ "names.family": 1 });

export const PatientModel = model<Patient>("Patient", patientSchema);
