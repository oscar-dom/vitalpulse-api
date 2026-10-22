import { Router, type Request, type Response } from "express";
import { AppError } from "../errors/app.error.js";
import { capabilityStatement } from "../fhir/capability.js";
import { FHIR_JSON } from "../fhir/types.js";
import { authenticateToken } from "../middlewares/auth.middleware.js";
import { methodNotAllowed } from "../middlewares/method.middleware.js";
import { observationsRouter } from "./observations.routes.js";
import { patientsRouter } from "./patients.routes.js";

// The FHIR endpoint, mounted at /fhir: [base]/[type]/[id] as the FHIR RESTful API defines.
export const fhirRouter = Router();

// The CapabilityStatement is public: a client reads it to learn how to talk to the
// server, including how to authenticate.
fhirRouter
  .route("/metadata")
  .get((_req: Request, res: Response) => {
    res.status(200).type(FHIR_JSON).json(capabilityStatement());
  })
  .all(methodNotAllowed("GET"));

// Every other FHIR interaction needs a token.
fhirRouter.use(authenticateToken);

fhirRouter.use("/Patient", patientsRouter);
fhirRouter.use("/Observation", observationsRouter);

// A resource type this server does not implement (FHIR answers 404 for it).
fhirRouter.use("/:type", (req: Request<{ type: string }>) => {
  throw new AppError(`Resource type "${req.params.type}" is not supported by this server.`, 404, {
    code: "not-supported",
  });
});
