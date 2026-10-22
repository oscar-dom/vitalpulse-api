import { type HydratedDocument, model, Schema, type Types } from "mongoose";
import { INTERPRETATION_CODES, type InterpretationCode } from "../fhir/vital-signs.js";

export const OBSERVATION_STATUSES = [
  "registered",
  "preliminary",
  "final",
  "amended",
  "corrected",
  "cancelled",
  "entered-in-error",
] as const;
export type ObservationStatus = (typeof OBSERVATION_STATUSES)[number];

/** The limits that were applied when the value was interpreted. */
export interface AppliedRange {
  low: number;
  high: number;
  criticalLow: number;
  criticalHigh?: number;
}

/**
 * What the database stores for a vital-sign observation. The patient is a real
 * reference (an ObjectId), shown to clients as "Patient/<id>". The unit is not stored:
 * it follows from the LOINC code. The range and the interpretation are stored, because
 * they record how the value was judged when it was taken, even if the catalog changes.
 */
export interface Observation {
  status: ObservationStatus;
  code: string;
  patient: Types.ObjectId;
  effective: Date;
  value: number;
  range: AppliedRange;
  interpretation: InterpretationCode;
  versionId: number;
  createdAt: Date;
  updatedAt: Date;
}

export type ObservationDocument = HydratedDocument<Observation>;

const rangeSchema = new Schema<AppliedRange>(
  {
    low: { type: Number, required: true },
    high: { type: Number, required: true },
    criticalLow: { type: Number, required: true },
    criticalHigh: { type: Number },
  },
  { _id: false },
);

const observationSchema = new Schema<Observation>(
  {
    status: { type: String, enum: OBSERVATION_STATUSES, required: true },
    code: { type: String, required: true },
    patient: {
      type: Schema.Types.ObjectId,
      ref: "Patient",
      required: [true, "patient is required"],
    },
    effective: { type: Date, required: true },
    value: { type: Number, required: true },
    range: { type: rangeSchema, required: true },
    interpretation: { type: String, enum: INTERPRETATION_CODES, required: true },
    versionId: { type: Number, required: true, default: 1, min: 1 },
  },
  { timestamps: true },
);

// Match the usual searches: a patient's observations by date, and by code or result.
observationSchema.index({ patient: 1, effective: -1 });
observationSchema.index({ code: 1, effective: -1 });
observationSchema.index({ interpretation: 1, effective: -1 });

export const ObservationModel = model<Observation>("Observation", observationSchema);
