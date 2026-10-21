import type { Bundle, Observation, Patient, Resource } from "fhir/r4";

export type { Bundle, Observation, Patient };

// The vital signs the API accepts, with the same ranges it applies. The web app uses
// them only to label values and preview a result; the stored result is the server's.
export interface VitalSign {
  code: string;
  name: string;
  short: string;
  unit: string;
  low: number;
  high: number;
  criticalLow: number;
  criticalHigh: number | null;
  min: number;
  max: number;
}

export const VITAL_SIGNS: VitalSign[] = [
  {
    code: "8867-4",
    name: "Heart rate",
    short: "HR",
    unit: "/min",
    low: 60,
    high: 100,
    criticalLow: 40,
    criticalHigh: 130,
    min: 0,
    max: 350,
  },
  {
    code: "9279-1",
    name: "Respiratory rate",
    short: "RR",
    unit: "/min",
    low: 12,
    high: 20,
    criticalLow: 8,
    criticalHigh: 30,
    min: 0,
    max: 100,
  },
  {
    code: "8310-5",
    name: "Body temperature",
    short: "Temp",
    unit: "°C",
    low: 36.1,
    high: 37.5,
    criticalLow: 35,
    criticalHigh: 40,
    min: 25,
    max: 45,
  },
  {
    code: "2708-6",
    name: "Oxygen saturation",
    short: "SpO₂",
    unit: "%",
    low: 95,
    high: 100,
    criticalLow: 90,
    criticalHigh: null,
    min: 0,
    max: 100,
  },
];

export const vitalSign = (code: string | undefined): VitalSign | undefined =>
  VITAL_SIGNS.find((sign) => sign.code === code);

export type Interpretation = "N" | "L" | "H" | "LL" | "HH";

export const INTERPRETATION_LABEL: Record<Interpretation, string> = {
  N: "Normal",
  L: "Low",
  H: "High",
  LL: "Critical low",
  HH: "Critical high",
};

/** Same rule as the server: a value equal to a limit stays on the inner side. */
export const interpret = (value: number, sign: VitalSign): Interpretation => {
  if (value < sign.criticalLow) return "LL";
  if (sign.criticalHigh !== null && value > sign.criticalHigh) return "HH";
  if (value < sign.low) return "L";
  if (value > sign.high) return "H";
  return "N";
};

// ---------- Reading resources ----------

/** The resources of a search Bundle: the matches, or what _include added. */
export const entries = <T extends Resource>(
  bundle: Bundle | undefined,
  mode: "match" | "include" = "match",
): T[] =>
  (bundle?.entry ?? [])
    .filter((entry) => (entry.search?.mode ?? "match") === mode)
    .map((entry) => entry.resource as T);

/** A paging link of a Bundle (next, previous...), already an absolute URL. */
export const link = (bundle: Bundle | undefined, relation: string): string | undefined =>
  bundle?.link?.find((item) => item.relation === relation)?.url;

/** The page a Bundle link points to, from its _page parameter. */
export const pageOf = (url: string | undefined): number =>
  Number(url ? (new URL(url).searchParams.get("_page") ?? 1) : 1);

export const patientName = (patient: Patient): string => {
  const name = patient.name?.find((item) => item.use === "official") ?? patient.name?.[0];
  return [...(name?.given ?? []), name?.family].filter(Boolean).join(" ") || "Unnamed patient";
};

export const initials = (patient: Patient): string =>
  patientName(patient)
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export const mrn = (patient: Patient): string => patient.identifier?.[0]?.value ?? "—";

const GENDER: Record<string, string> = {
  male: "Male",
  female: "Female",
  other: "Other",
  unknown: "Unknown",
};
export const genderLabel = (gender: string | undefined): string =>
  gender ? (GENDER[gender] ?? gender) : "—";

/** Whole years from a FHIR birthDate (YYYY, YYYY-MM or YYYY-MM-DD) to today. */
export const age = (birthDate: string | undefined, today = new Date()): number | undefined => {
  if (!birthDate) return undefined;
  const [year, month = 1, day = 1] = birthDate.split("-").map(Number);
  let years = today.getFullYear() - year!;
  if (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day)) {
    years -= 1;
  }
  return years;
};

export const observationCode = (observation: Observation): string | undefined =>
  observation.code.coding?.find((coding) => coding.system === "http://loinc.org")?.code;

export const interpretationOf = (observation: Observation): Interpretation | undefined =>
  observation.interpretation?.[0]?.coding?.[0]?.code as Interpretation | undefined;

export const patientIdOf = (observation: Observation): string | undefined =>
  observation.subject?.reference?.replace(/^Patient\//, "");

const STATUS_LABEL: Record<string, string> = {
  registered: "Registered",
  preliminary: "Preliminary",
  final: "Final",
  amended: "Amended",
  corrected: "Corrected",
  cancelled: "Cancelled",
  "entered-in-error": "Entered in error",
};
export const statusLabel = (status: string): string => STATUS_LABEL[status] ?? status;

/** "2026-10-21 08:30" in the browser's time zone. */
export const formatDateTime = (iso: string | undefined): string => {
  if (!iso) return "—";
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/**
 * The latest observation of each vital sign, from observations sorted newest first.
 * Those entered in error do not count as a result.
 */
export const latestBySign = (observations: Observation[]): Map<string, Observation> => {
  const latest = new Map<string, Observation>();
  for (const observation of observations) {
    const code = observationCode(observation);
    if (!code || observation.status === "entered-in-error" || latest.has(code)) continue;
    latest.set(code, observation);
  }
  return latest;
};
