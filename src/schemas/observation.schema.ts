import { z } from "zod";
import { OBSERVATION_STATUSES } from "../models/observation.model.js";
import {
  fhirIdSchema,
  fhirInstantSchema,
  fhirStringSchema,
  fhirUriSchema,
  ignoredByServer,
} from "./fhir.schema.js";

// Business rules (supported LOINC code, matching unit, existing patient) are checked by
// the service and answer 422. This schema only checks the shape of the resource.

const codingSchema = z.strictObject({
  system: fhirUriSchema.optional(),
  code: fhirStringSchema.optional(),
  display: fhirStringSchema.optional(),
});

const codeableConceptSchema = z.strictObject({
  coding: z.array(codingSchema, "must be an array of codings").min(1, "needs at least one coding"),
  text: fhirStringSchema.optional(),
});

// A clock a bit ahead of the server's should not reject a real measurement.
const CLOCK_SKEW_MS = 5 * 60 * 1000;

/** Rejects elements the server works out itself, with a message that says so. */
const setByServer = (element: string) =>
  z.undefined(`${element} is calculated by the server from the value; do not send it`).optional();

export const observationSchema = z.strictObject({
  resourceType: z.literal("Observation", 'must be "Observation"'),
  id: fhirIdSchema.optional(),
  meta: ignoredByServer,
  text: ignoredByServer,
  status: z.enum(OBSERVATION_STATUSES, `must be one of: ${OBSERVATION_STATUSES.join(", ")}`),
  category: z.array(codeableConceptSchema, "must be an array").optional(),
  code: codeableConceptSchema,
  subject: z.strictObject({
    reference: z
      .string("must be a reference like Patient/<id>")
      .regex(/^Patient\/[A-Za-z0-9\-.]{1,64}$/, "must be a reference like Patient/<id>"),
    display: fhirStringSchema.optional(),
  }),
  effectiveDateTime: fhirInstantSchema.refine(
    (date) => date.getTime() <= Date.now() + CLOCK_SKEW_MS,
    "cannot be in the future",
  ),
  valueQuantity: z.strictObject({
    value: z.number("must be a number").finite("must be a finite number"),
    unit: fhirStringSchema.optional(),
    system: fhirUriSchema.optional(),
    code: fhirStringSchema.optional(),
  }),
  interpretation: setByServer("interpretation"),
  referenceRange: setByServer("referenceRange"),
});

export type ObservationInput = z.infer<typeof observationSchema>;
