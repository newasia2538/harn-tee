export type PaymentValidation = { valid: true } | { valid: false; error: string };

function digits(value: string) {
  return value.replace(/[^0-9]/g, "");
}

export function validatePromptPay(
  type: "phone" | "national-id",
  value: string,
): PaymentValidation {
  const normalized = digits(value);
  if (type === "phone") {
    if (!/^0[0-9]{9}$/.test(normalized)) {
      return { valid: false, error: "เบอร์ PromptPay ต้องมี 10 หลัก" };
    }
    return { valid: true };
  }

  if (!/^[0-9]{13}$/.test(normalized)) {
    return { valid: false, error: "เลขบัตรประชาชนต้องมี 13 หลัก" };
  }
  const checksum = normalized
    .slice(0, 12)
    .split("")
    .reduce((sum, digit, index) => sum + Number(digit) * (13 - index), 0);
  if ((11 - (checksum % 11)) % 10 !== Number(normalized[12])) {
    return { valid: false, error: "เลขบัตรประชาชนไม่ถูกต้อง" };
  }
  return { valid: true };
}

export function validateBankAccount(_bankId: string, value: string): PaymentValidation {
  const normalized = digits(value);
  if (!/^[0-9]{10,12}$/.test(normalized)) {
    return { valid: false, error: "เลขบัญชีธนาคารควรมี 10 ถึง 12 หลัก" };
  }
  return { valid: true };
}

export function validateQrFile(file: { type: string; size: number }): PaymentValidation {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    return { valid: false, error: "รองรับเฉพาะไฟล์ PNG, JPG หรือ WebP" };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { valid: false, error: "ไฟล์ QR ต้องมีขนาดไม่เกิน 5 MB" };
  }
  return { valid: true };
}
