import type { QueryFilter } from "mongoose";
import { searchsetBundle } from "../fhir/bundle.js";
import { toFhirPatient } from "../fhir/patient.mapper.js";
import {
  allOf,
  assertOneOf,
  dropUnknownParams,
  parseBoolean,
  parseToken,
  readPaging,
  readSort,
  type SearchParams,
  stringMatcher,
} from "../fhir/search.js";
import type { Bundle } from "../fhir/types.js";
import { type Patient, PatientModel } from "../models/patient.model.js";
import { GENDERS } from "../schemas/patient.schema.js";
import { isMongoId } from "./ids.service.js";

/** Search parameters of Patient, also declared in the CapabilityStatement. */
export const PATIENT_SEARCH_PARAMS = [
  { name: "_id", type: "token", documentation: "Logical id of the patient." },
  {
    name: "identifier",
    type: "token",
    documentation: "An identifier: system|value, value, or system|.",
  },
  {
    name: "name",
    type: "string",
    documentation: "Start of a family or given name, ignoring case (:exact, :contains).",
  },
  {
    name: "family",
    type: "string",
    documentation: "Start of the family name, ignoring case (:exact, :contains).",
  },
  { name: "gender", type: "token", documentation: "male | female | other | unknown." },
  { name: "active", type: "token", documentation: "true or false." },
] as const;

const SORTABLE = { family: "names.family", birthdate: "birthDate", _lastUpdated: "updatedAt" };

const KNOWN = [
  ...PATIENT_SEARCH_PARAMS.map(({ name }) => name),
  "name:exact",
  "name:contains",
  "family:exact",
  "family:contains",
  "_count",
  "_page",
  "_sort",
];

type Condition = QueryFilter<Patient>;

const identifierCondition = (value: string): Condition => {
  const { system, code } = parseToken(value);
  if (system && code) return { identifierKeys: `${system}|${code}` };
  if (system) return { "identifiers.system": system };
  return { "identifiers.value": code };
};

const conditionsFor = (params: SearchParams): Condition[] => {
  const conditions: Condition[] = [{ deleted: false }];

  for (const [key, values] of params) {
    const [name, modifier] = key.split(":");
    switch (name) {
      case "_id":
        conditions.push(...allOf(values, (id) => ({ _id: { $in: isMongoId(id) ? [id] : [] } })));
        break;
      case "identifier":
        conditions.push(...allOf(values, identifierCondition));
        break;
      case "name":
        conditions.push(
          ...allOf(values, (text) => {
            const matcher = stringMatcher(text, modifier);
            return { $or: [{ "names.family": matcher }, { "names.given": matcher }] };
          }),
        );
        break;
      case "family":
        conditions.push(
          ...allOf(values, (text) => ({ "names.family": stringMatcher(text, modifier) })),
        );
        break;
      case "gender":
        conditions.push(
          ...allOf(values, (gender) => {
            assertOneOf("gender", gender, GENDERS);
            return { gender };
          }),
        );
        break;
      case "active":
        conditions.push(...allOf(values, (active) => ({ active: parseBoolean("active", active) })));
        break;
    }
  }
  return conditions;
};

/** GET /fhir/Patient?...: one page of matching living patients as a searchset Bundle. */
export const searchPatients = async (
  params: SearchParams,
  preferHeader: string | undefined,
): Promise<Bundle> => {
  dropUnknownParams(params, KNOWN, preferHeader);
  const { count, page } = readPaging(params);
  const sort = readSort(params, SORTABLE, { "names.family": 1 });
  const filter: Condition = { $and: conditionsFor(params) };

  const [patients, total] = await Promise.all([
    count === 0
      ? Promise.resolve([])
      : PatientModel.find(filter)
          // _id breaks ties so pages never repeat or skip patients with equal values.
          .sort({ ...sort, _id: 1 })
          .skip((page - 1) * count)
          .limit(count),
    PatientModel.countDocuments(filter),
  ]);

  return searchsetBundle({
    resourceType: "Patient",
    params,
    page,
    count,
    total,
    matches: patients.map(toFhirPatient),
  });
};
