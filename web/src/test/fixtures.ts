// FHIR resources shaped like the API's responses, for page tests.

export const BASE = "http://localhost:3000/fhir";

export const patient = (id: string, family: string, extra: object = {}) => ({
  resourceType: "Patient",
  id,
  meta: { versionId: "1", lastUpdated: "2026-10-21T08:00:00Z" },
  identifier: [{ system: "urn:mrn", value: `MRN-${id}` }],
  active: true,
  name: [{ family, given: ["Test"] }],
  gender: "female",
  birthDate: "1985-12-10",
  ...extra,
});

const UNITS: Record<string, string> = {
  "8867-4": "beats/minute",
  "9279-1": "breaths/minute",
  "8310-5": "°C",
  "2708-6": "%",
};

export const observation = (
  patientId: string,
  code: string,
  value: number,
  result: string,
  at: string,
  extra: object = {},
) => ({
  resourceType: "Observation",
  id: `${patientId}-${code}-${at.slice(0, 13)}`,
  meta: { versionId: "1", lastUpdated: at },
  status: "final",
  category: [
    {
      coding: [
        {
          system: "http://terminology.hl7.org/CodeSystem/observation-category",
          code: "vital-signs",
        },
      ],
    },
  ],
  code: { coding: [{ system: "http://loinc.org", code }] },
  subject: { reference: `Patient/${patientId}` },
  effectiveDateTime: at,
  valueQuantity: { value, unit: UNITS[code], system: "http://unitsofmeasure.org" },
  interpretation: [{ coding: [{ code: result }] }],
  referenceRange: [{ low: { value: 60 }, high: { value: 100 } }],
  ...extra,
});

export const bundle = (resources: object[], total: number, links: Record<string, string> = {}) => ({
  resourceType: "Bundle",
  type: "searchset",
  total,
  link: Object.entries(links).map(([relation, url]) => ({ relation, url })),
  entry: resources.map((resource) => ({ resource, search: { mode: "match" } })),
});
