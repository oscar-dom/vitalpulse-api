import { Router } from "express";
import { create, read, remove, search, update, vread } from "../controllers/patients.controller.js";
import { authorizeRoles } from "../middlewares/auth.middleware.js";
import { methodNotAllowed } from "../middlewares/method.middleware.js";
import { validateBody } from "../middlewares/validate.middleware.js";
import { patientSchema } from "../schemas/patient.schema.js";

// Mounted at /fhir/Patient behind authenticateToken. Anyone signed in reads patients;
// only admins change the catalog.
export const patientsRouter = Router();

const adminOnly = authorizeRoles("admin");

patientsRouter
  .route("/")
  .get(search)
  .post(adminOnly, validateBody(patientSchema, "Patient"), create)
  .all(methodNotAllowed("GET", "POST"));

patientsRouter
  .route("/:id")
  .get(read)
  .put(adminOnly, validateBody(patientSchema, "Patient"), update)
  .delete(adminOnly, remove)
  .all(methodNotAllowed("GET", "PUT", "DELETE"));

patientsRouter.route("/:id/_history/:vid").get(vread).all(methodNotAllowed("GET"));
