import { z } from "zod";

// FHIR primitive data types (https://hl7.org/fhir/R4/datatypes.html), as Zod schemas.

// date: YYYY, YYYY-MM or YYYY-MM-DD, with no time and no time zone.
const FHIR_DATE = /^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/;

// dateTime with a time part. FHIR requires the time zone whenever hours are given.
const FHIR_DATE_TIME_WITH_TIME =
  /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:([0-5]\d|60)(\.\d+)?(Z|[+-]((0\d|1[0-3]):[0-5]\d|14:00))$/;

/** A real calendar day: 2026-02-30 matches the pattern but does not exist. */
const isRealDate = (value: string): boolean => {
  const [year, month = "01", day = "01"] = value.split("-");
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(`${year}-${month}-${day}`);
};

export const fhirDateSchema = z
  .string("must be a FHIR date (YYYY, YYYY-MM or YYYY-MM-DD)")
  .regex(FHIR_DATE, "must be a FHIR date (YYYY, YYYY-MM or YYYY-MM-DD)")
  .refine(isRealDate, "is not a real calendar date");

/**
 * A dateTime down to the second, with time zone, e.g. 2026-10-21T08:30:00+02:00. A
 * measurement happens at an instant, so the date-only forms that FHIR also allows
 * for dateTime are not accepted here.
 */
export const fhirInstantSchema = z
  .string("must be a FHIR dateTime with time and time zone, e.g. 2026-10-21T08:30:00Z")
  .regex(
    FHIR_DATE_TIME_WITH_TIME,
    "must be a FHIR dateTime with time and time zone, e.g. 2026-10-21T08:30:00Z",
  )
  .refine((value) => isRealDate(value.slice(0, 10)), "is not a real calendar date")
  .transform((value) => new Date(value));

// id: up to 64 letters, digits, "-" and ".".
export const fhirIdSchema = z
  .string("must be a FHIR id")
  .regex(/^[A-Za-z0-9\-.]{1,64}$/, "must be a FHIR id (1-64 letters, digits, '-' or '.')");

export const fhirUriSchema = z
  .string("must be a URI")
  .trim()
  .min(1, "must be a URI")
  .regex(/^\S+$/, "must be a URI without spaces");

export const fhirStringSchema = z
  .string("must be a string")
  .trim()
  .min(1, "must not be empty")
  .max(200, "must have at most 200 characters");

// meta and text are written by the server; whatever the client sends is ignored.
export const ignoredByServer = z.unknown().optional();
