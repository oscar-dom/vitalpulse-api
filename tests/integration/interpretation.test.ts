import { VITAL_SIGNS } from "../../src/fhir/vital-signs.js";
import { interpret } from "../../src/services/interpretation.service.js";

const heartRate = VITAL_SIGNS["8867-4"]!; // normal 60-100, critical below 40 or above 130
const spo2 = VITAL_SIGNS["2708-6"]!; // normal 95-100, critical below 90, no critical high

describe("interpret", () => {
  it.each([
    [72, "N"],
    [60, "N"],
    [100, "N"],
    [59, "L"],
    [40, "L"],
    [39.9, "LL"],
    [101, "H"],
    [130, "H"],
    [131, "HH"],
  ])("heart rate %s is %s", (value, expected) => {
    expect(interpret(value, heartRate)).toBe(expected);
  });

  it("only flags the critical side a vital sign has", () => {
    expect(interpret(89, spo2)).toBe("LL");
    expect(interpret(92, spo2)).toBe("L");
    expect(interpret(100, spo2)).toBe("N");
  });
});
