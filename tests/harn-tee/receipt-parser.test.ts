import { describe, expect, it } from "vitest";
import { analyzeReceiptLines, parseReceiptLines } from "../../lib/harn-tee/receipt-parser";
import type { ReceiptBox, ReceiptOcrLine, ReceiptOcrWord } from "../../lib/harn-tee/types";

function word(text: string, x0: number, y0: number, x1: number, confidence: number | null = 95): ReceiptOcrWord {
  return { text, confidence, bbox: { x0, y0, x1, y1: y0 + 10 } };
}

function ocr(...words: ReceiptOcrWord[]): ReceiptOcrLine {
  return { text: words.map((word) => word.text).join(" "), confidence: 95, words };
}

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

  it("excludes totals, fees, discounts, and change from product rows", () => {
    const items = parseReceiptLines([
      { text: "รวม 1,309.50", confidence: 99 },
      { text: "VAT 7%", confidence: 99 },
      { text: "Service 10%", confidence: 99 },
      { text: "ส่วนลด 50", confidence: 99 },
      { text: "เงินทอน 0", confidence: 99 },
    ]);

    expect(items).toEqual([]);
  });

  it.each(["7% VAT 4.90", "7 % VAT 4.90", "10% Service Charge 7.00", "7% ภาษี 4.90", "Net Total 81.90"])("excludes prefixed fees and net totals: %s", (text) => {
    expect(analyzeReceiptLines([{ text, confidence: 95 }])).toMatchObject({ items: [], ignoredLines: [text] });
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

  it.each([
    "Cash500", "cash 500.00", "Change 20", "Discount-20", "Payment 500",
    "Credit Card 500", "PromptPay 500", "รับเงิน 500", "ชำระเงิน 500",
    "20/10/2026", "Date20/10/2026", "2026-10-20 12:30", "0812345678",
    "Tel0812345678", "โทร 081-234-5678", "Tax ID 0105551234567",
    "เลขประจำตัวผู้เสียภาษี 0105551234567", "Grand Total 500", "ยอดสุทธิ 500",
  ])("does not import the non-product line %s", (text) => {
    expect(parseReceiptLines([{ text, confidence: 99 }])).toEqual([]);
  });

  it.each([
    ["tea ฿1,234.50T", "tea", 123450],
    ["tea ๑๒๓.๕๐ T", "tea", 12350],
    ["tea THB 70.00", "tea", 7000],
    ["tea 70.00฿", "tea", 7000],
  ])("parses explicit currency and tax suffix in %s", (text, name, priceSatang) => {
    expect(parseReceiptLines([{ text, confidence: 95 }])[0]).toMatchObject({
      name, priceSatang, status: "ready",
    });
  });

  it.each([
    "tea -20", "tea −20.00", "tea - 20", "tea − 20.00", "tea (20.00)", "tea 20.00-", "tea 7%",
    "tea 1,23.00", "tea 12.345", "tea 70..00", "tea 12,34,567.00",
    "tea 0812345678", "tea 1234567890123", "tea 20/10/2026",
  ])("does not turn unsafe money in %s into a positive price", (text) => {
    expect(parseReceiptLines([{ text, confidence: 99 }])[0]).toMatchObject({
      priceSatang: null, status: "needs-review",
    });
  });

  it("keeps a bare amount out of ready products", () => {
    expect(parseReceiptLines([{ text: "70.00", confidence: 99 }])[0]).toMatchObject({
      priceSatang: 7000, status: "needs-review",
    });
  });

  it.each([null, undefined, Number.NaN])("requires known confidence (%s)", (confidence) => {
    const [item] = parseReceiptLines([{ text: "tea 70.00", confidence: confidence! }]);
    expect(item.status).toBe("needs-review");
    expect(item.reviewReasons).toEqual(expect.arrayContaining([expect.stringMatching(/[ก-๙]/)]));
  });

  it("does not mistake a trailing quantity for the displayed amount", () => {
    const [item] = parseReceiptLines([{ text: "tea70.00 2", confidence: 99 }]);
    expect(item).toMatchObject({ name: "tea", priceSatang: 7000, status: "needs-review" });
  });

  it("preserves an explicitly marked integer price before a trailing quantity", () => {
    expect(parseReceiptLines([{ text: "tea ฿70 2", confidence: 99 }])[0]).toMatchObject({
      name: "tea", priceSatang: 7000, status: "needs-review",
    });
  });

  it.each([
    "tea 2 35.00 70.00", "tea 35.00 2 70.00", "2 tea 35.00 70.00",
    "tea 2 x 35.00 70.00",
  ])("uses the printed line amount when quantity arithmetic agrees: %s", (text) => {
    expect(parseReceiptLines([{ text, confidence: 99 }])[0]).toMatchObject({
      name: "tea", priceSatang: 7000, status: "ready",
    });
  });

  it("requires review when quantity arithmetic contradicts the printed amount", () => {
    const [item] = parseReceiptLines([{ text: "tea 2 35.00 80.00", confidence: 99 }]);
    expect(item).toMatchObject({ name: "tea", priceSatang: 8000, status: "needs-review" });
  });

  it("flags a numeric OCR correction instead of silently accepting it", () => {
    const [item] = parseReceiptLines([{ text: "tea 7O.OO", confidence: 99 }]);
    expect(item).toMatchObject({ name: "tea", priceSatang: 7000, status: "needs-review" });
    expect(item.reviewReasons).toEqual(expect.arrayContaining([expect.stringMatching(/แก้.*ตัวเลข|ตัวเลข.*แก้/)]));
  });

  it("does not correct ordinary product text into a price", () => {
    expect(parseReceiptLines([{ text: "ชา SOLO", confidence: 99 }])[0]).toMatchObject({
      name: "ชา SOLO", priceSatang: null, status: "needs-review",
    });
  });
});

describe("receipt layout analysis", () => {
  it.each([
    ["70", ".", "50"], ["70.", "50"], ["70", ".50"],
  ])("reconstructs split decimal fragments for explicit review: %j", (...fragments) => {
    const [item] = parseReceiptLines([ocr(word("tea", 10, 10, 60), ...fragments.map((text, i) => word(text, 150 + i * 20, 10, 169 + i * 20)))]);
    expect(item).toMatchObject({ name: "tea", priceSatang: 7050, status: "needs-review" });
    expect(item.priceBox).toMatchObject({ x0: 150, x1: 169 + (fragments.length - 1) * 20 });
  });

  it("does not accept an invalid split decimal's fraction as the full price", () => {
    const [item] = parseReceiptLines([ocr(word("tea", 10, 10, 60), word("70", 150, 10, 170), word(".", 171, 10, 175), word("500", 176, 10, 200))]);
    expect(item).toMatchObject({ priceSatang: null, status: "needs-review" });
  });

  it("does not split a widely spaced volume description into another charge", () => {
    const items = parseReceiptLines([ocr(word("water", 10, 10, 60), word("500", 70, 10, 95), word("ml", 150, 10, 170), word("20.00", 250, 10, 300))]);
    expect(items).toMatchObject([{ name: "water 500 ml", priceSatang: 2000, status: "ready" }]);
    expect(items).toHaveLength(1);
  });

  it("requires review rather than creating two charges from one ambiguous OCR line", () => {
    const items = parseReceiptLines([ocr(word("tea", 10, 10, 60), word("70.00", 130, 10, 180), word("special", 250, 10, 310), word("80.00", 390, 10, 440))]);
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe("needs-review");
  });

  it("preserves shared line origins when overlapping tiles prefer different words", () => {
    const items = parseReceiptLines([
      ocr(word("tea", 10, 10, 60, 95), word("70.00", 130, 10, 180, 95), word("special", 250, 10, 310, 90), word("80.00", 390, 10, 440, 90)),
      ocr(word("tea", 10, 10, 60, 90), word("70.00", 130, 10, 180, 90), word("special", 250, 10, 310, 95), word("80.00", 390, 10, 440, 95)),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe("needs-review");
  });

  it("joins adjacent Thai glyph fragments without inserting spaces in the product name", () => {
    const [item] = parseReceiptLines([ocr(word("ข้", 10, 20, 30), word("า", 31, 20, 40), word("ว", 41, 20, 50), word("ผัด", 51, 20, 80), word("80.00", 250, 20, 300))]);
    expect(item).toMatchObject({ name: "ข้าวผัด", priceSatang: 8000, status: "ready" });
  });

  it("excludes a recognized table header without dropping the next product", () => {
    const result = analyzeReceiptLines([{ text: "รายการ QTY UNIT AMOUNT", confidence: 95 }, { text: "ชาเย็น 70.00", confidence: 95 }]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ name: "ชาเย็น", priceSatang: 7000 });
    expect(result.ignoredLines).toEqual(["รายการ QTY UNIT AMOUNT"]);
  });

  it("preserves the retry crop and low price confidence despite high line confidence", () => {
    const sourceBox: ReceiptBox = { x0: 10, y0: 20, x1: 180, y1: 45 };
    const priceBox: ReceiptBox = { x0: 140, y0: 20, x1: 180, y1: 45 };
    const [item] = analyzeReceiptLines([{
      text: "ชาเย็น 75.00", confidence: 95, bbox: sourceBox,
      words: [
        { text: "ชาเย็น", confidence: 95, bbox: { x0: 10, y0: 20, x1: 90, y1: 45 } },
        { text: "75.00", confidence: 35, bbox: priceBox },
      ],
    }]).items;
    expect(item).toMatchObject({ name: "ชาเย็น", priceSatang: 7500, sourceBox, priceBox, priceConfidence: 35, status: "needs-review" });
    expect(item.reviewReasons).toEqual(expect.arrayContaining([expect.stringMatching(/ราคา/)]));
  });

  it("retains a malformed price word's crop for review and retry", () => {
    const priceBox: ReceiptBox = { x0: 250, y0: 10, x1: 300, y1: 20 };
    const [item] = parseReceiptLines([
      ocr(word("tea", 10, 10, 60), { text: "70..00", confidence: 35, bbox: priceBox }),
    ]);
    expect(item).toMatchObject({ name: "tea", priceSatang: null, priceBox, priceConfidence: 35, status: "needs-review" });
  });

  it("reconstructs rows across name and price OCR blocks in canvas order", () => {
    const result = analyzeReceiptLines([
      ocr(word("ชาเย็น", 10, 10, 70)),
      ocr(word("ข้าวผัด", 10, 35, 80)),
      ocr(word("70.00", 250, 12, 300)),
      ocr(word("90.00", 250, 36, 300)),
    ]);
    expect(result.items.map(({ name, priceSatang, status }) => ({ name, priceSatang, status }))).toEqual([
      { name: "ชาเย็น", priceSatang: 7000, status: "ready" },
      { name: "ข้าวผัด", priceSatang: 9000, status: "ready" },
    ]);
    expect(result.items[0]).toMatchObject({
      sourceBox: { x0: 10, y0: 10, x1: 300, y1: 22 },
      priceBox: { x0: 250, y0: 12, x1: 300, y1: 22 },
      priceConfidence: 95,
    });
  });

  it("uses line boxes when word boxes are unavailable", () => {
    const [item] = parseReceiptLines([
      { text: "tea", confidence: 92, bbox: { x0: 10, y0: 10, x1: 80, y1: 20 } },
      { text: "70.00", confidence: 88, bbox: { x0: 250, y0: 11, x1: 300, y1: 21 } },
    ]);
    expect(item).toMatchObject({
      name: "tea", priceSatang: 7000, status: "ready", priceConfidence: 88,
      sourceBox: { x0: 10, y0: 10, x1: 300, y1: 21 },
      priceBox: { x0: 250, y0: 11, x1: 300, y1: 21 },
    });
  });

  it("deduplicates overlapping tile words only at the same physical position", () => {
    const items = parseReceiptLines([
      ocr(word("tea", 10, 10, 60, 80), word("70.00", 250, 10, 300, 80)),
      ocr(word("tea", 11, 11, 61, 99), word("70.00", 251, 11, 301, 99)),
      ocr(word("tea", 10, 35, 60), word("70.00", 250, 35, 300)),
    ]);
    expect(items).toHaveLength(2);
    expect(items.map((item) => [item.name, item.priceSatang, item.status])).toEqual([
      ["tea", 7000, "ready"], ["tea", 7000, "ready"],
    ]);
    expect(items[0].priceConfidence).toBe(99);
  });

  it("keeps identical rows without coordinates because their position is unknown", () => {
    expect(parseReceiptLines([
      { text: "tea 70.00", confidence: 95 }, { text: "tea 70.00", confidence: 95 },
    ])).toHaveLength(2);
  });

  it("requires review when tiles disagree about a price at the same position", () => {
    const items = parseReceiptLines([
      ocr(word("tea", 10, 10, 60), word("70.00", 250, 10, 300, 95)),
      ocr(word("80.00", 250, 10, 300, 70)),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: "tea", priceSatang: 7000, status: "needs-review" });
    expect(items[0].reviewReasons).toEqual(expect.arrayContaining([expect.stringMatching(/ไม่ตรงกัน|ขัดแย้ง/)]));
  });

  it.each([
    [42, 99, /ชื่อสินค้า/, /ราคา/],
    [99, 42, /ราคา/, /ชื่อสินค้า/],
    [null, 99, /ชื่อสินค้า/, /ราคา/],
    [99, null, /ราคา/, /ชื่อสินค้า/],
  ])("reports name (%s) and price (%s) confidence independently", (nameConfidence, priceConfidence, affected, unaffected) => {
    const [item] = parseReceiptLines([
      ocr(word("tea", 10, 10, 60, nameConfidence), word("70.00", 250, 10, 300, priceConfidence)),
    ]);
    expect(item).toMatchObject({ name: "tea", priceSatang: 7000, status: "needs-review", priceConfidence });
    expect(item.reviewReasons).toEqual(expect.arrayContaining([expect.stringMatching(affected)]));
    expect(item.reviewReasons?.some((reason) => unaffected.test(reason))).toBe(false);
  });

  it("joins an indented wrapped name with the following priced line for review", () => {
    const items = parseReceiptLines([
      ocr(word("ข้าวผัด", 10, 10, 130)),
      ocr(word("กุ้ง", 20, 23, 65), word("90.00", 250, 23, 300)),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      name: "ข้าวผัด กุ้ง", priceSatang: 9000, status: "needs-review",
      sourceBox: { x0: 10, y0: 10, x1: 300, y1: 33 },
      priceBox: { x0: 250, y0: 23, x1: 300, y1: 33 },
    });
  });

  it("does not join separate aligned rows or infer wrapping without coordinates", () => {
    expect(parseReceiptLines([
      ocr(word("water", 10, 10, 80)),
      ocr(word("tea", 10, 23, 65), word("70.00", 250, 23, 300)),
    ])).toHaveLength(2);
    expect(parseReceiptLines([
      { text: "water", confidence: 99 }, { text: "tea 70.00", confidence: 99 },
    ])).toHaveLength(2);
  });

  it("includes an indented name continuation below an already priced row for review", () => {
    const items = parseReceiptLines([
      ocr(word("ข้าวผัด", 10, 10, 100), word("90.00", 250, 10, 300)),
      ocr(word("กุ้ง", 20, 23, 65)),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: "ข้าวผัด กุ้ง", priceSatang: 9000, status: "needs-review" });
  });

  it("requires review for low confidence quantity evidence used to disambiguate amounts", () => {
    const [item] = parseReceiptLines([
      ocr(word("tea", 10, 10, 60), word("2", 130, 10, 140, 30),
        word("35.00", 180, 10, 230), word("70.00", 250, 10, 300)),
    ]);
    expect(item).toMatchObject({ priceSatang: 7000, priceConfidence: 95, status: "needs-review" });
    expect(item.reviewReasons).toEqual(expect.arrayContaining([expect.stringMatching(/จำนวน|ต่อหน่วย/)]));
  });

  it("does not merge neighboring rows that overlap by less than half a line", () => {
    const items = parseReceiptLines([
      ocr(word("tea", 10, 10, 60), word("70.00", 250, 10, 300)),
      ocr(word("tea", 10, 17, 60), word("70.00", 250, 17, 300)),
    ]);
    expect(items.map((item) => item.priceSatang)).toEqual([7000, 7000]);
  });

  it("ignores dotted dates and additional explicit total and tender labels", () => {
    expect(analyzeReceiptLines([
      "20.10.2026", "2026/10/20", "รวมทั้งสิ้น 140.00", "รวมเป็นเงิน 140.00",
      "Amount Due 140.00", "Tendered 200.00",
    ].map((text) => ({ text, confidence: 99 }))).items).toEqual([]);
  });

  it("keeps invalid coordinate data for review without manufacturing a box", () => {
    const [item] = parseReceiptLines([{
      text: "tea 70.00", confidence: 40,
      bbox: { x0: 20, y0: 30, x1: 10, y1: Number.NaN },
    }]);
    expect(item).toMatchObject({ name: "tea", priceSatang: 7000, status: "needs-review" });
    expect(item.sourceBox).toBeUndefined();
  });

  it("keeps two side-by-side product columns separate", () => {
    const items = parseReceiptLines([
      ocr(word("tea", 10, 10, 60), word("70.00", 130, 10, 180)),
      ocr(word("cake", 250, 10, 310), word("80.00", 390, 10, 440)),
    ]);
    expect(items.map((item) => [item.name, item.priceSatang, item.status])).toEqual([
      ["tea", 7000, "ready"], ["cake", 8000, "ready"],
    ]);
  });

  it("does not treat a volume inside a product name as a separate column's price", () => {
    expect(parseReceiptLines([
      ocr(word("water", 10, 10, 60), word("500", 70, 10, 95), word("ml", 100, 10, 120),
        word("20.00", 250, 10, 300)),
    ])).toMatchObject([{ name: "water 500 ml", priceSatang: 2000, status: "ready" }]);
  });

  it("keeps a malformed amount in one column from contaminating its neighboring product", () => {
    expect(parseReceiptLines([
      ocr(word("tea", 10, 10, 60), word("70..00", 130, 10, 180)),
      ocr(word("cake", 250, 10, 310), word("80.00", 390, 10, 440)),
    ])).toMatchObject([
      { name: "tea", priceSatang: null, status: "needs-review" },
      { name: "cake", priceSatang: 8000, status: "ready" },
    ]);
  });

  it("preserves product names containing total or Thai combined-dish words", () => {
    const items = parseReceiptLines([
      { text: "Totalitarian tea 70.00", confidence: 99 },
      { text: "รวมมิตร 80.00", confidence: 99 },
      { text: "ยำรวม 90.00", confidence: 99 },
    ]);
    expect(items.map((item) => item.name)).toEqual(["Totalitarian tea", "รวมมิตร", "ยำรวม"]);
  });

  it("returns known nonitems separately after geometric grouping", () => {
    const result = analyzeReceiptLines([
      ocr(word("Cash", 10, 10, 60)), ocr(word("500", 250, 10, 300)),
      { text: "VAT 7%", confidence: 99 },
      { text: "ส่วนลด -20", confidence: 99 },
    ]);
    expect(result).toMatchObject({ items: [], ignoredLines: ["Cash 500", "VAT 7%", "ส่วนลด -20"], subtotalSatang: null });
  });
});

describe("explicit receipt subtotals", () => {
  it.each(["Subtotal", "ยอดรวมสินค้า", "รวมสินค้า", "ยอดก่อนภาษี"])("extracts only the explicit %s amount", (label) => {
    const result = analyzeReceiptLines([
      { text: "tea 70.00", confidence: 99 },
      { text: `${label} ๑,๒๓๔.๕๐`, confidence: 99 },
      { text: "Grand Total 1,450.00", confidence: 99 },
    ]);
    expect(result.subtotalSatang).toBe(123450);
    expect(result.items).toHaveLength(1);
    expect(result.ignoredLines).toEqual([`${label} ๑,๒๓๔.๕๐`, "Grand Total 1,450.00"]);
  });

  it("extracts a subtotal split across OCR blocks", () => {
    expect(analyzeReceiptLines([
      ocr(word("Subtotal", 10, 30, 100)), ocr(word("140.00", 250, 31, 310)),
    ])).toMatchObject({ items: [], ignoredLines: ["Subtotal 140.00"], subtotalSatang: 14000 });
  });

  it("rejects conflicting subtotals but accepts repeated agreement", () => {
    expect(analyzeReceiptLines([
      { text: "Subtotal 70.00", confidence: 99 }, { text: "รวมสินค้า 80.00", confidence: 99 },
    ]).subtotalSatang).toBeNull();
    expect(analyzeReceiptLines([
      { text: "Subtotal 70.00", confidence: 99 }, { text: "รวมสินค้า 70.00", confidence: 99 },
    ]).subtotalSatang).toBe(7000);
  });

  it("accepts an explicit zero subtotal", () => {
    expect(analyzeReceiptLines([{ text: "Subtotal 0.00", confidence: 99 }]).subtotalSatang).toBe(0);
  });

  it("does not select a subtotal when overlapping tiles disagree at the same coordinates", () => {
    expect(analyzeReceiptLines([
      ocr(word("Subtotal", 10, 10, 100), word("70.00", 250, 10, 300, 95)),
      ocr(word("80.00", 250, 10, 300, 80)),
    ]).subtotalSatang).toBeNull();
  });

  it.each(["Total 70.00", "รวม 70.00", "ยอดสุทธิ 70.00", "Subtotal 7O.OO", "Subtotal -70.00", "Subtotal 1,23.00"])("does not trust %s as a subtotal", (text) => {
    expect(analyzeReceiptLines([{ text, confidence: 99 }]).subtotalSatang).toBeNull();
  });
});
