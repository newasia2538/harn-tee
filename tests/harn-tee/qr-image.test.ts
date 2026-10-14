import { describe, expect, it } from "vitest";
import { hasValidQrImageSignature } from "../../lib/harn-tee/qr-image";

describe("uploaded QR image type verification", () => {
  it("accepts bytes whose file signature matches the declared image type", () => {
    expect(hasValidQrImageSignature("image/png", Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(true);
    expect(hasValidQrImageSignature("image/jpeg", Uint8Array.from([255, 216, 255, 0]))).toBe(true);
    expect(hasValidQrImageSignature("image/webp", Uint8Array.from([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]))).toBe(true);
  });

  it("rejects a declared image type that does not match the actual bytes", () => {
    expect(hasValidQrImageSignature("image/png", Uint8Array.from([255, 216, 255, 0]))).toBe(false);
    expect(hasValidQrImageSignature("image/svg+xml", new Uint8Array([60, 115, 118, 103]))).toBe(false);
    expect(hasValidQrImageSignature("image/png", new Uint8Array([137, 80]))).toBe(false);
  });
});
