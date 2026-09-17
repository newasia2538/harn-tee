import { describe, expect, it } from "vitest";
import { numberInputValue } from "../../lib/harn-tee/input";

describe("harn-tee numeric input display", () => {
  it("leaves zero and missing values blank while preserving entered values", () => {
    expect(numberInputValue(undefined)).toBe("");
    expect(numberInputValue(0)).toBe("");
    expect(numberInputValue(7)).toBe("7");
    expect(numberInputValue(7.5)).toBe("7.5");
  });
});
