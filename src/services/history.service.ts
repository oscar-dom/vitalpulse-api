import { Types } from "mongoose";
import { GoneError, NotFoundError } from "../errors/app.error.js";
import type { Resource } from "../fhir/types.js";
import { ResourceVersionModel, type VersionedType } from "../models/history.model.js";

/** Saves a version of a resource. Without `resource`, the version records a delete. */
export const recordVersion = async (
  resourceType: VersionedType,
  resourceId: Types.ObjectId,
  versionId: number,
  recordedAt: Date,
  resource?: Resource,
): Promise<void> => {
  await ResourceVersionModel.create({
    resourceType,
    resourceId,
    versionId,
    recordedAt,
    deleted: resource === undefined,
    ...(resource && { resource }),
  });
};

/** One past version (vread): 404 if it never existed, 410 if it records the delete. */
export const getVersion = async (
  resourceType: VersionedType,
  id: string,
  versionId: string,
): Promise<Resource> => {
  const version = /^\d+$/.test(versionId)
    ? await ResourceVersionModel.findOne({
        resourceType,
        resourceId: new Types.ObjectId(id),
        versionId: Number(versionId),
      }).lean()
    : null;

  if (!version) throw new NotFoundError(resourceType, `${id}/_history/${versionId}`);
  if (version.deleted || !version.resource) {
    throw new GoneError(resourceType, `${id}/_history/${versionId}`);
  }
  return version.resource;
};
