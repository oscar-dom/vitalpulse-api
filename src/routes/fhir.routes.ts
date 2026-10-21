import { Router, type Request } from "express";
import { AppError } from "../errors/app.error.js";
import { authenticateToken } from "../middlewares/auth.middleware.js";
import { observationsRouter } from "./observations.routes.js";
import { patientsRouter } from "./patients.routes.js";

// The FHIR endpoint, mounted at /fhir: [base]/[type]/[id] as the FHIR RESTful API defines.
export const fhirRouter = Router();

// Every FHIR interaction needs a token.
fhirRouter.use(authenticateToken);

fhirRouter.use("/Patient", patientsRouter);
fhirRouter.use("/Observation", observationsRouter);

// A resource type this server does not implement (FHIR answers 404 for it).
fhirRouter.use("/:type", (req: Request<{ type: string }>) => {
  throw new AppError(`Resource type "${req.params.type}" is not supported by this server.`, 404, {
    code: "not-supported",
  });
});
