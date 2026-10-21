import type { CodeableConcept, Quantity } from "./types.js";

// Code systems used by vital-sign observations.
export const LOINC = "http://loinc.org";
export const UCUM = "http://unitsofmeasure.org";
export const OBSERVATION_CATEGORY = "http://terminology.hl7.org/CodeSystem/observation-category";
export const INTERPRETATION = "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation";
export const VITAL_SIGNS_PROFILE = "http://hl7.org/fhir/StructureDefinition/vitalsigns";

export interface VitalSign {
  display: string;
  // Unit as UCUM code (Quantity.code) and as text for people (Quantity.unit).
  ucum: string;
  unit: string;
  // Normal range for an adult at rest. Outside it the value is L or H.
  low: number;
  high: number;
  // Beyond these limits the value is critical: LL or HH.
  criticalLow: number;
  criticalHigh?: number;
  // Values outside these limits cannot be a real measurement (a typo, a broken device):
  // they are rejected instead of stored as critical.
  plausible: [min: number, max: number];
}

/**
 * The vital signs this server accepts, by LOINC code. The ranges are orientative
 * values for adults, enough to show the server-side interpretation; they are not
 * clinical advice.
 */
export const VITAL_SIGNS: Record<string, VitalSign> = {
  "8867-4": {
    display: "Heart rate",
    ucum: "/min",
    unit: "beats/minute",
    low: 60,
    high: 100,
    criticalLow: 40,
    criticalHigh: 130,
    plausible: [0, 350],
  },
  "9279-1": {
    display: "Respiratory rate",
    ucum: "/min",
    unit: "breaths/minute",
    low: 12,
    high: 20,
    criticalLow: 8,
    criticalHigh: 30,
    plausible: [0, 100],
  },
  "8310-5": {
    display: "Body temperature",
    ucum: "Cel",
    unit: "°C",
    low: 36.1,
    high: 37.5,
    criticalLow: 35,
    criticalHigh: 40,
    plausible: [25, 45],
  },
  "2708-6": {
    display: "Oxygen saturation in Arterial blood",
    ucum: "%",
    unit: "%",
    low: 95,
    high: 100,
    criticalLow: 90,
    plausible: [0, 100],
  },
};

export const VITAL_SIGN_CODES = Object.keys(VITAL_SIGNS);

export const INTERPRETATION_CODES = ["N", "L", "H", "LL", "HH"] as const;
export type InterpretationCode = (typeof INTERPRETATION_CODES)[number];

const INTERPRETATION_DISPLAY: Record<InterpretationCode, string> = {
  N: "Normal",
  L: "Low",
  H: "High",
  LL: "Critical low",
  HH: "Critical high",
};

export const quantity = (value: number, sign: VitalSign): Quantity => ({
  value,
  unit: sign.unit,
  system: UCUM,
  code: sign.ucum,
});

export const vitalSignsCategory = (): CodeableConcept[] => [
  {
    coding: [{ system: OBSERVATION_CATEGORY, code: "vital-signs", display: "Vital Signs" }],
    text: "Vital Signs",
  },
];

export const loincConcept = (code: string): CodeableConcept => {
  const display = VITAL_SIGNS[code]?.display;
  return {
    coding: [{ system: LOINC, code, ...(display && { display }) }],
    ...(display && { text: display }),
  };
};

export const interpretationConcept = (code: InterpretationCode): CodeableConcept[] => [
  {
    coding: [{ system: INTERPRETATION, code, display: INTERPRETATION_DISPLAY[code] }],
    text: INTERPRETATION_DISPLAY[code],
  },
];
