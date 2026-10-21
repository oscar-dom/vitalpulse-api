import type { Request, Response } from "express";
import { parseIfMatch, sendResource } from "../fhir/http.js";
import { toFhirPatient } from "../fhir/patient.mapper.js";
import type { PatientInput } from "../schemas/patient.schema.js";
import {
  createPatient,
  deletePatient,
  getPatient,
  getPatientVersion,
  updatePatient,
} from "../services/patients.service.js";

type IdParams = { id: string };
type VersionParams = IdParams & { vid: string };

export const create = async (req: Request, res: Response): Promise<void> => {
  const patient = await createPatient(req.body as PatientInput);
  sendResource(res, 201, toFhirPatient(patient), { location: true });
};

export const read = async (req: Request<IdParams>, res: Response): Promise<void> => {
  const patient = await getPatient(req.params.id);
  sendResource(res, 200, toFhirPatient(patient));
};

export const vread = async (req: Request<VersionParams>, res: Response): Promise<void> => {
  const patient = await getPatientVersion(req.params.id, req.params.vid);
  sendResource(res, 200, patient);
};

export const update = async (req: Request<IdParams>, res: Response): Promise<void> => {
  const patient = await updatePatient(
    req.params.id,
    req.body as PatientInput,
    parseIfMatch(req.get("If-Match")),
  );
  sendResource(res, 200, toFhirPatient(patient), { location: true });
};

export const remove = async (req: Request<IdParams>, res: Response): Promise<void> => {
  await deletePatient(req.params.id, parseIfMatch(req.get("If-Match")));
  res.status(204).end();
};
