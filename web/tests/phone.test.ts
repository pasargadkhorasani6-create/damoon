import { describe, expect, it } from "vitest";
import { normalizeIranMobile, toLatinDigits } from "@/lib/phone";

describe("phone", () => {
  it("normalizes common Iranian mobile formats", () => {
    for (const v of ["09121234567", "+989121234567", "00989121234567", "989121234567", "9121234567", "۰۹۱۲۱۲۳۴۵۶۷", "0912 123 4567"]) {
      expect(normalizeIranMobile(v)).toBe("09121234567");
    }
  });
  it("rejects invalid numbers", () => {
    for (const v of ["0212345678", "0912123456", "abc", "", "091212345678"]) expect(normalizeIranMobile(v)).toBeNull();
  });
  it("converts Persian/Arabic digits", () => {
    expect(toLatinDigits("۱۲۳٤٥")).toBe("12345");
  });
});
