import { Router } from "express";
import { create, read, update, vread } from "../controllers/observations.controller.js";
import { methodNotAllowed } from "../middlewares/method.middleware.js";
import { validateBody } from "../middlewares/validate.middleware.js";
import { observationSchema } from "../schemas/observation.schema.js";

// Mounted at /fhir/Observation behind authenticateToken. Any signed-in user records,
// reads and corrects observations. There is no delete: a mistake is corrected with a
// new version (status amended or entered-in-error), so the record keeps it.
export const observationsRouter = Router();

observationsRouter
  .route("/")
  .post(validateBody(observationSchema, "Observation"), create)
  .all(methodNotAllowed("POST"));

observationsRouter
  .route("/:id")
  .get(read)
  .put(validateBody(observationSchema, "Observation"), update)
  .all(methodNotAllowed("GET", "PUT"));

observationsRouter.route("/:id/_history/:vid").get(vread).all(methodNotAllowed("GET"));
