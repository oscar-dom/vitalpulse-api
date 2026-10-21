import type { Response } from "express";
import { env } from "../config/env.js";
import { AppError } from "../errors/app.error.js";
import { FHIR_JSON, type Resource } from "./types.js";

/** Absolute URL of a resource, or of one of its versions, on this server. */
export const resourceUrl = (resourceType: string, id: string, versionId?: string): string =>
  `${env.FHIR_BASE_URL}/${resourceType}/${id}${versionId ? `/_history/${versionId}` : ""}`;

/** Weak ETag of a version, the form FHIR uses: W/"3". */
export const etag = (versionId: string): string => `W/"${versionId}"`;

/**
 * The version an If-Match header asks for, or undefined when there is no header. A
 * header that is not a FHIR version ETag is a 400, not a silent mismatch.
 */
export const parseIfMatch = (header: string | undefined): number | undefined => {
  if (header === undefined) return undefined;
  const match = /^(?:W\/)?"(\d+)"$/.exec(header.trim());
  if (!match) {
    throw new AppError('If-Match must be a version ETag, e.g. W/"1".', 400);
  }
  return Number(match[1]);
};

/**
 * Sends a resource as application/fhir+json with the headers FHIR expects: ETag and
 * Last-Modified from its meta, and Location when it was just created or updated.
 */
export const sendResource = (
  res: Response,
  status: number,
  resource: Resource,
  { location = false }: { location?: boolean } = {},
): void => {
  const { versionId, lastUpdated } = resource.meta ?? {};
  if (versionId) res.set("ETag", etag(versionId));
  if (lastUpdated) res.set("Last-Modified", new Date(lastUpdated).toUTCString());
  if (location && resource.id && versionId) {
    res.set("Location", resourceUrl(resource.resourceType, resource.id, versionId));
  }
  res.status(status).type(FHIR_JSON).json(resource);
};
