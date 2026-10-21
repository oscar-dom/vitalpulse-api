import { type QueryFilter, Types } from "mongoose";
import { ValidationError } from "../errors/app.error.js";
import { searchsetBundle } from "../fhir/bundle.js";
import { toFhirObservation } from "../fhir/observation.mapper.js";
import { toFhirPatient } from "../fhir/patient.mapper.js";
import {
  allOf,
  assertOneOf,
  dateCondition,
  dropUnknownParams,
  parseToken,
  readPaging,
  readSort,
  type SearchParams,
} from "../fhir/search.js";
import type { Bundle } from "../fhir/types.js";
import {
  INTERPRETATION,
  INTERPRETATION_CODES,
  LOINC,
  OBSERVATION_CATEGORY,
} from "../fhir/vital-signs.js";
import {
  OBSERVATION_STATUSES,
  type Observation,
  ObservationModel,
} from "../models/observation.model.js";
import { PatientModel } from "../models/patient.model.js";
import { isMongoId } from "./ids.service.js";

/** Search parameters of Observation, also declared in the CapabilityStatement. */
export const OBSERVATION_SEARCH_PARAMS = [
  { name: "_id", type: "token", documentation: "Logical id of the observation." },
  {
    name: "patient",
    type: "reference",
    documentation: "The patient: Patient/<id> or <id>.",
  },
  { name: "subject", type: "reference", documentation: "Same as patient." },
  {
    name: "code",
    type: "token",
    documentation: "The vital sign, as LOINC code: http://loinc.org|8867-4 or 8867-4.",
  },
  {
    name: "interpretation",
    type: "token",
    documentation: "The result worked out by the server: N, L, H, LL or HH.",
  },
  { name: "status", type: "token", documentation: "final, amended, entered-in-error..." },
  { name: "category", type: "token", documentation: "Always vital-signs on this server." },
  {
    name: "date",
    type: "date",
    documentation: "When it was measured, with prefix eq, ne, gt, ge, lt or le.",
  },
] as const;

// What _include can add: the patient of each observation.
export const OBSERVATION_INCLUDES = ["Observation:patient", "Observation:subject"];

const SORTABLE = { date: "effective", _lastUpdated: "updatedAt" };

const KNOWN = [
  ...OBSERVATION_SEARCH_PARAMS.map(({ name }) => name),
  "_count",
  "_page",
  "_sort",
  "_include",
];

type Condition = QueryFilter<Observation>;

// Matches nothing: for a value that is valid but can never be true on this server.
const NOTHING: Condition = { _id: { $in: [] } };

/** "Patient/<id>" or "<id>". Anything else cannot be one of our patients. */
const patientCondition = (value: string): Condition => {
  const id = value.startsWith("Patient/") ? value.slice("Patient/".length) : value;
  return isMongoId(id) ? { patient: new Types.ObjectId(id) } : NOTHING;
};

const codeCondition = (value: string): Condition => {
  const { system, code } = parseToken(value);
  if (system !== undefined && system !== LOINC) return NOTHING;
  return code === undefined ? {} : { code };
};

const interpretationCondition = (value: string): Condition => {
  const { system, code } = parseToken(value);
  if (system !== undefined && system !== INTERPRETATION) return NOTHING;
  if (code === undefined) return {};
  assertOneOf("interpretation", code, INTERPRETATION_CODES);
  return { interpretation: code };
};

const categoryCondition = (value: string): Condition => {
  const { system, code } = parseToken(value);
  const matches =
    (system === undefined || system === OBSERVATION_CATEGORY) &&
    (code === undefined || code === "vital-signs");
  return matches ? {} : NOTHING;
};

const conditionsFor = (params: SearchParams): Condition[] => {
  const conditions: Condition[] = [];

  for (const [name, values] of params) {
    switch (name) {
      case "_id":
        conditions.push(...allOf(values, (id) => (isMongoId(id) ? { _id: id } : NOTHING)));
        break;
      case "patient":
      case "subject":
        conditions.push(...allOf(values, patientCondition));
        break;
      case "code":
        conditions.push(...allOf(values, codeCondition));
        break;
      case "interpretation":
        conditions.push(...allOf(values, interpretationCondition));
        break;
      case "status":
        conditions.push(
          ...allOf(values, (status) => {
            assertOneOf("status", status, OBSERVATION_STATUSES);
            return { status };
          }),
        );
        break;
      case "category":
        conditions.push(...allOf(values, categoryCondition));
        break;
      case "date":
        // A comma has no meaning in a date, so each value is one condition.
        conditions.push(...values.map((value) => ({ effective: dateCondition("date", value) })));
        break;
    }
  }
  return conditions;
};

/** Whether the client asked for the patients of the results (_include). */
const wantsPatients = (params: SearchParams): boolean => {
  const includes = params.get("_include") ?? [];
  for (const include of includes) {
    // "Observation:patient:Patient" names the target type, which is the same thing here.
    const base = include.replace(/:Patient$/, "");
    if (!OBSERVATION_INCLUDES.includes(base)) {
      throw new ValidationError([
        {
          code: "not-supported",
          diagnostics: `Parameter "_include": "${include}" is not supported. Use ${OBSERVATION_INCLUDES.join(" or ")}.`,
        },
      ]);
    }
  }
  return includes.length > 0;
};

/**
 * GET /fhir/Observation?...: one page of observations as a searchset Bundle. Filters,
 * sorting and paging combine freely. With _include=Observation:patient, the patients
 * of the page are added after the matches, so the client needs no second request.
 */
export const searchObservations = async (
  params: SearchParams,
  preferHeader: string | undefined,
): Promise<Bundle> => {
  dropUnknownParams(params, KNOWN, preferHeader);
  const { count, page } = readPaging(params);
  // Newest first by default: the usual way to look at measurements.
  const sort = readSort(params, SORTABLE, { effective: -1 });
  const includePatients = wantsPatients(params);
  const conditions = conditionsFor(params);
  const filter: Condition = conditions.length > 0 ? { $and: conditions } : {};

  const [observations, total] = await Promise.all([
    count === 0
      ? Promise.resolve([])
      : ObservationModel.find(filter)
          // _id breaks ties so pages never repeat or skip observations taken at once.
          .sort({ ...sort, _id: 1 })
          .skip((page - 1) * count)
          .limit(count),
    ObservationModel.countDocuments(filter),
  ]);

  const patients =
    includePatients && observations.length > 0
      ? await PatientModel.find({
          _id: { $in: [...new Set(observations.map(({ patient }) => String(patient)))] },
          deleted: false,
        })
      : [];

  return searchsetBundle({
    resourceType: "Observation",
    params,
    page,
    count,
    total,
    matches: observations.map(toFhirObservation),
    includes: patients.map(toFhirPatient),
  });
};
