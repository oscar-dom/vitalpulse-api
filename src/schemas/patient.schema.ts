import { z } from "zod";
import {
  fhirDateSchema,
  fhirIdSchema,
  fhirStringSchema,
  fhirUriSchema,
  ignoredByServer,
} from "./fhir.schema.js";

export const GENDERS = ["male", "female", "other", "unknown"] as const;
export const NAME_USES = [
  "usual",
  "official",
  "temp",
  "nickname",
  "anonymous",
  "old",
  "maiden",
] as const;

const identifierSchema = z.strictObject({
  // The namespace of the value, e.g. the hospital's medical record numbers.
  system: fhirUriSchema,
  value: fhirStringSchema,
});

const humanNameSchema = z
  .strictObject({
    use: z.enum(NAME_USES, `must be one of: ${NAME_USES.join(", ")}`).optional(),
    family: fhirStringSchema.optional(),
    given: z.array(fhirStringSchema, "must be an array of strings").max(5).optional(),
  })
  .refine((name) => name.family !== undefined || (name.given?.length ?? 0) > 0, {
    message: "a name needs a family name or at least one given name",
  });

/**
 * The subset of the FHIR Patient resource this server stores. Strict: an element the
 * server does not support is rejected instead of silently dropped, so the client
 * never believes something was saved when it was not.
 */
export const patientSchema = z.strictObject({
  resourceType: z.literal("Patient", 'must be "Patient"'),
  id: fhirIdSchema.optional(),
  meta: ignoredByServer,
  text: ignoredByServer,
  identifier: z
    .array(identifierSchema, "must be an array")
    .min(1, "at least one identifier is required")
    .max(10),
  active: z.boolean("must be true or false").default(true),
  name: z.array(humanNameSchema, "must be an array").min(1, "at least one name is required").max(5),
  gender: z.enum(GENDERS, `must be one of: ${GENDERS.join(", ")}`).optional(),
  birthDate: fhirDateSchema
    .refine((date) => date <= new Date().toISOString().slice(0, 10), "cannot be in the future")
    .optional(),
});

export type PatientInput = z.infer<typeof patientSchema>;
