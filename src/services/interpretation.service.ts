import type { InterpretationCode, VitalSign } from "../fhir/vital-signs.js";

export type Limits = Pick<VitalSign, "low" | "high" | "criticalLow" | "criticalHigh">;

/**
 * How a value compares with its reference range. The server decides it, never the
 * client. A value equal to a limit is still on the inner side: 100 bpm is normal and
 * 40 bpm is low, not critical.
 */
export const interpret = (
  value: number,
  { low, high, criticalLow, criticalHigh }: Limits,
): InterpretationCode => {
  if (value < criticalLow) return "LL";
  if (criticalHigh !== undefined && value > criticalHigh) return "HH";
  if (value < low) return "L";
  if (value > high) return "H";
  return "N";
};
