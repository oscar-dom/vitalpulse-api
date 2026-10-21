import type { Request, Response } from "express";
import { parseIfMatch, sendResource } from "../fhir/http.js";
import { toFhirObservation } from "../fhir/observation.mapper.js";
import type { ObservationInput } from "../schemas/observation.schema.js";
import {
  createObservation,
  getObservation,
  getObservationVersion,
  updateObservation,
} from "../services/observations.service.js";

type IdParams = { id: string };
type VersionParams = IdParams & { vid: string };

export const create = async (req: Request, res: Response): Promise<void> => {
  const observation = await createObservation(req.body as ObservationInput);
  sendResource(res, 201, toFhirObservation(observation), { location: true });
};

export const read = async (req: Request<IdParams>, res: Response): Promise<void> => {
  const observation = await getObservation(req.params.id);
  sendResource(res, 200, toFhirObservation(observation));
};

export const vread = async (req: Request<VersionParams>, res: Response): Promise<void> => {
  const observation = await getObservationVersion(req.params.id, req.params.vid);
  sendResource(res, 200, observation);
};

export const update = async (req: Request<IdParams>, res: Response): Promise<void> => {
  const observation = await updateObservation(
    req.params.id,
    req.body as ObservationInput,
    parseIfMatch(req.get("If-Match")),
  );
  sendResource(res, 200, toFhirObservation(observation), { location: true });
};
