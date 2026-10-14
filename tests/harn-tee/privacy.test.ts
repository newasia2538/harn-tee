import { describe, expect, it } from "vitest";
import { maskSensitiveValue } from "../../lib/harn-tee/privacy";

describe("sensitive payment value masking", () => {
  it("keeps only the last four digits visible", () => {
    expect(maskSensitiveValue("1234567890")).toBe("••••••••7890");
    expect(maskSensitiveValue("1234567890123")).toBe("••••••••0123");
  });

  it("does not reveal short or empty values", () => {
    expect(maskSensitiveValue("1234")).toBe("••••");
    expect(maskSensitiveValue("12")).toBe("••••");
    expect(maskSensitiveValue("")).toBe("••••");
  });
});
