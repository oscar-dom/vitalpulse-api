import { model, Schema, type Types } from "mongoose";
import type { Resource } from "../fhir/types.js";

export const VERSIONED_TYPES = ["Patient", "Observation"] as const;
export type VersionedType = (typeof VERSIONED_TYPES)[number];

/**
 * One saved version of a resource, as the client saw it. Every create, update and
 * delete adds a row, so vread (GET [type]/[id]/_history/[vid]) can return any past
 * version exactly, even after later changes.
 */
export interface ResourceVersion {
  resourceType: VersionedType;
  resourceId: Types.ObjectId;
  versionId: number;
  // The FHIR JSON of that version. Absent for the version that records a delete.
  resource?: Resource;
  deleted: boolean;
  recordedAt: Date;
}

const resourceVersionSchema = new Schema<ResourceVersion>({
  resourceType: { type: String, enum: VERSIONED_TYPES, required: true },
  resourceId: { type: Schema.Types.ObjectId, required: true },
  versionId: { type: Number, required: true, min: 1 },
  resource: { type: Schema.Types.Mixed },
  deleted: { type: Boolean, required: true, default: false },
  recordedAt: { type: Date, required: true },
});

// A version number exists once per resource.
resourceVersionSchema.index({ resourceType: 1, resourceId: 1, versionId: 1 }, { unique: true });

export const ResourceVersionModel = model<ResourceVersion>(
  "ResourceVersion",
  resourceVersionSchema,
);
