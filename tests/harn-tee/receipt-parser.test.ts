import { describe, expect, it } from "vitest";
import { parseReceiptLines } from "../../lib/harn-tee/receipt-parser";

describe("parseReceiptLines", () => {
  it("normalizes Thai digits, comma separators, currency, and satang", () => {
    const [item] = parseReceiptLines([
      { text: "  ข้าวผัด ๑,๒๓๔.๕๐ บาท ", confidence: 90 },
    ]);

    expect(item).toMatchObject({
      id: "ocr-1",
      name: "ข้าวผัด",
      priceSatang: 123450,
      rawLine: "ข้าวผัด ๑,๒๓๔.๕๐ บาท",
      confidence: 90,
      status: "ready",
    });
  });

  it("keeps lines without a price for manual review", () => {
    const items = parseReceiptLines([
      { text: "ชาเย็น ฿75.5", confidence: 90 },
      { text: "น้ำเปล่า", confidence: 90 },
    ]);

    expect(items[0]).toMatchObject({ name: "ชาเย็น", priceSatang: 7550, status: "ready" });
    expect(items[1]).toMatchObject({ name: "น้ำเปล่า", priceSatang: null, status: "needs-review" });
  });

  it("marks totals, fees, discounts, and change as review-only rows", () => {
    const items = parseReceiptLines([
      { text: "รวม 1,309.50", confidence: 99 },
      { text: "VAT 7%", confidence: 99 },
      { text: "Service 10%", confidence: 99 },
      { text: "ส่วนลด 50", confidence: 99 },
      { text: "เงินทอน 0", confidence: 99 },
    ]);

    expect(items).toHaveLength(5);
    expect(items.every((item) => item.status === "needs-review")).toBe(true);
    expect(items.map((item) => item.priceSatang)).toEqual([130950, 700, 1000, 5000, null]);
  });

  it("marks low-confidence rows for review and skips blank lines", () => {
    const items = parseReceiptLines([
      { text: "", confidence: 100 },
      { text: "ข้าว 100", confidence: 59 },
      { text: "น้ำ 25", confidence: 90 },
    ]);

    expect(items.map((item) => item.id)).toEqual(["ocr-1", "ocr-2"]);
    expect(items[0].status).toBe("needs-review");
    expect(items[1].status).toBe("ready");
  });
});
