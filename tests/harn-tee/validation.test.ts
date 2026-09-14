import { describe, expect, it } from "vitest";
import { validateBillDraft, validateRecipient } from "../../lib/harn-tee/validation";

const validDraft = {
  title: "มื้อเย็น",
  participants: [
    { id: "p1", name: "มิน", order: 0 },
    { id: "p2", name: "ปอ", order: 1 },
  ],
  items: [
    {
      id: "i1",
      name: "พิซซ่า",
      priceSatang: 10000,
      payerIds: ["p1", "p2"],
      order: 0,
    },
  ],
  vatPercent: 7,
  serviceChargePercent: 10,
};

describe("harn-tee bill validation", () => {
  it("accepts a complete bill draft", () => {
    expect(validateBillDraft(validDraft)).toEqual({ valid: true, errors: [] });
  });

  it("rejects blank and duplicate participant names", () => {
    const result = validateBillDraft({
      ...validDraft,
      participants: [
        { id: "p1", name: " มิน ", order: 0 },
        { id: "p2", name: "มิน", order: 1 },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("ชื่อผู้ร่วมบิลต้องไม่ซ้ำกัน");
  });

  it("rejects invalid prices, fee percentages, and payer selections", () => {
    const result = validateBillDraft({
      ...validDraft,
      items: [
        {
          ...validDraft.items[0],
          name: "",
          priceSatang: 0,
          payerIds: [],
        },
      ],
      vatPercent: 101,
      serviceChargePercent: -1,
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        "รายการสินค้าต้องมีชื่อ",
        "ราคาสินค้าต้องมากกว่า 0",
        "ต้องเลือกผู้จ่ายอย่างน้อย 1 คน",
        "VAT ต้องอยู่ระหว่าง 0 ถึง 100%",
        "Service charge ต้องอยู่ระหว่าง 0 ถึง 100%",
      ]),
    );
  });

  it("validates the selected recipient payment identifiers", () => {
    const result = validateRecipient({
      name: "มิน",
      bank: { bankId: "SCB", accountNumber: "123" },
      promptPay: { type: "phone", value: "0812" },
      qr: null,
      visible: true,
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        "เลขบัญชีธนาคารควรมี 10 ถึง 12 หลัก",
        "เบอร์ PromptPay ต้องมี 10 หลัก",
      ]),
    );
  });
});
