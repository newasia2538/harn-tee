import { validateBankAccount, validatePromptPay } from "./payment";
import type { BillDraft, RecipientData, ValidationResult } from "./types";

export function validateBillDraft(input: BillDraft): ValidationResult {
  const errors: string[] = [];
  const names = new Set<string>();
  const participantIds = new Set(input.participants.map((person) => person.id));

  if (
    input.calculationMode !== undefined &&
    input.calculationMode !== "vat-after-service" &&
    input.calculationMode !== "separate"
  ) {
    errors.push("ไม่รู้จักสูตรคำนวณ VAT และ Service charge");
  }

  if (input.participants.length === 0) {
    errors.push("ต้องมีผู้ร่วมบิลอย่างน้อย 1 คน");
  }

  for (const participant of input.participants) {
    const normalizedName = participant.name.trim().toLocaleLowerCase();
    if (!normalizedName) {
      errors.push("ชื่อผู้ร่วมบิลต้องไม่ว่าง");
    } else if (names.has(normalizedName)) {
      errors.push("ชื่อผู้ร่วมบิลต้องไม่ซ้ำกัน");
    }
    names.add(normalizedName);
  }

  if (input.items.length === 0) {
    errors.push("ต้องมีรายการสินค้าอย่างน้อย 1 รายการ");
  }

  for (const item of input.items) {
    if (!item.name.trim()) errors.push("รายการสินค้าต้องมีชื่อ");
    if (!Number.isInteger(item.priceSatang) || item.priceSatang <= 0) {
      errors.push("ราคาสินค้าต้องมากกว่า 0");
    }
    if (
      item.payerIds.length === 0 ||
      item.payerIds.some((payerId) => !participantIds.has(payerId))
    ) {
      errors.push("ต้องเลือกผู้จ่ายอย่างน้อย 1 คน");
    }
  }

  if (input.vatPercent < 0 || input.vatPercent > 100) {
    errors.push("VAT ต้องอยู่ระหว่าง 0 ถึง 100%");
  }
  if (
    input.serviceChargePercent < 0 ||
    input.serviceChargePercent > 100
  ) {
    errors.push("Service charge ต้องอยู่ระหว่าง 0 ถึง 100%");
  }

  if ((input.feeMode ?? "bill") === "item") {
    for (const item of input.items) {
      if ((item.vatPercent ?? 0) < 0 || (item.vatPercent ?? 0) > 100) {
        errors.push("VAT ของรายการต้องอยู่ระหว่าง 0 ถึง 100%");
      }
      if (
        (item.serviceChargePercent ?? 0) < 0 ||
        (item.serviceChargePercent ?? 0) > 100
      ) {
        errors.push("Service charge ของรายการต้องอยู่ระหว่าง 0 ถึง 100%");
      }
    }
  }

  return errors.length > 0
    ? { valid: false, errors: [...new Set(errors)] }
    : { valid: true, errors: [] };
}

export function validateRecipient(
  recipient: RecipientData | undefined,
  allowPendingQr = false,
): ValidationResult {
  const errors: string[] = [];
  if (!recipient) {
    return { valid: false, errors: ["ต้องมีช่องทางรับเงินอย่างน้อย 1 ช่องทาง"] };
  }

  const hasBank = Boolean(recipient.bank);
  const hasPromptPay = Boolean(recipient.promptPay);
  const hasQr = Boolean(recipient.qr) || allowPendingQr;
  if (!hasBank && !hasPromptPay && !hasQr) {
    errors.push("ต้องมีช่องทางรับเงินอย่างน้อย 1 ช่องทาง");
  }
  if (recipient.bank) {
    const result = validateBankAccount(
      recipient.bank.bankId,
      recipient.bank.accountNumber,
    );
    if (!result.valid) errors.push(result.error);
  }
  if (recipient.promptPay) {
    const result = validatePromptPay(
      recipient.promptPay.type,
      recipient.promptPay.value,
    );
    if (!result.valid) errors.push(result.error);
  }

  return errors.length > 0
    ? { valid: false, errors: [...new Set(errors)] }
    : { valid: true, errors: [] };
}
