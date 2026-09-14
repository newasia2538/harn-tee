import { describe, expect, it } from "vitest";
import {
  validateBankAccount,
  validatePromptPay,
  validateQrFile,
} from "../../lib/harn-tee/payment";

describe("harn-tee payment validation", () => {
  it("accepts supported PromptPay phone and national ID formats", () => {
    expect(validatePromptPay("phone", "0812345678")).toEqual({ valid: true });
    expect(validatePromptPay("national-id", "1101700203450")).toEqual({ valid: true });
  });

  it("rejects PromptPay values with the wrong length", () => {
    expect(validatePromptPay("phone", "081234")).toEqual({
      valid: false,
      error: "เบอร์ PromptPay ต้องมี 10 หลัก",
    });
    expect(validatePromptPay("national-id", "1234")).toEqual({
      valid: false,
      error: "เลขบัตรประชาชนต้องมี 13 หลัก",
    });
  });

  it("validates bank account digits without claiming the account exists", () => {
    expect(validateBankAccount("SCB", "1234567890")).toEqual({ valid: true });
    expect(validateBankAccount("SCB", "123")).toEqual({
      valid: false,
      error: "เลขบัญชีธนาคารควรมี 10 ถึง 12 หลัก",
    });
  });

  it("limits QR files to supported images under 5 MB", () => {
    expect(validateQrFile({ type: "image/png", size: 1024 })).toEqual({ valid: true });
    expect(validateQrFile({ type: "application/pdf", size: 1024 })).toEqual({
      valid: false,
      error: "รองรับเฉพาะไฟล์ PNG, JPG หรือ WebP",
    });
  });
});
