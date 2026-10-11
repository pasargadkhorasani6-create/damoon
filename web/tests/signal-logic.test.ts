import { describe, expect, it } from "vitest";
import { canonicalSymbol, classifyClose, computeR, validateLevels } from "@/lib/signals/logic";

describe("signal logic", () => {
  it("canonicalizes broker symbols", () => {
    expect(canonicalSymbol("XAUUSD.r")).toBe("XAUUSD");
    expect(canonicalSymbol("xauusdm")).toBe("XAUUSD");
    expect(canonicalSymbol("EURUSD_i")).toBe("EURUSD");
    expect(canonicalSymbol("US30.cash")).toBe("US30");
    expect(canonicalSymbol("_DJI30")).toBe("US30");
    expect(canonicalSymbol("GBPUSD")).toBe("GBPUSD");
  });
  it("validates levels", () => {
    expect(validateLevels("BUY", 10, 9, 11)).toBeNull();
    expect(validateLevels("BUY", 10, 11, 12)).not.toBeNull();
    expect(validateLevels("SELL", 10, 11, 9)).toBeNull();
    expect(validateLevels("SELL", 10, 11, 12)).not.toBeNull();
  });
  it("computes R", () => {
    expect(computeR("BUY", 100, 99, 102)).toBe(2);
    expect(computeR("SELL", 100, 101, 102)).toBe(-2);
    expect(computeR("BUY", 100, 100, 101)).toBeNull();
  });
  it("classifies unknown closes", () => {
    const base = { fill: 100, initialSl: 99, sl: 99, tp: 101 };
    expect(classifyClose("UNKNOWN", { ...base, exit: 100.95 })).toBe("TP_HIT");
    expect(classifyClose("UNKNOWN", { ...base, exit: 99.05 })).toBe("SL_HIT");
    expect(classifyClose("UNKNOWN", { ...base, exit: 100.4 })).toBe("CLOSED");
    expect(classifyClose("MANUAL", { ...base, exit: 101 })).toBe("CLOSED");
  });
});
