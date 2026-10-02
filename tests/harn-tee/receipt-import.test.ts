import { describe, expect, it } from "vitest";
import {
  appendReceiptItems,
  createItemDraftsFromReceipt,
  isReceiptItemReady,
} from "../../lib/harn-tee/receipt-import";
import type { ItemDraft, ReceiptOcrItem } from "../../lib/harn-tee/types";

const confirmedRows: Array<ReceiptOcrItem & { status: "ready"; priceSatang: number }> = [
  {
    id: "ocr-1",
    name: "  Pizza  ",
    priceSatang: 1200,
    rawLine: "Pizza 12",
    confidence: 90,
    status: "ready",
  },
  {
    id: "ocr-2",
    name: "ชาเย็น",
    priceSatang: 7550,
    rawLine: "ชาเย็น 75.50",
    confidence: 85,
    status: "ready",
  },
];

describe("receipt item importer", () => {
  it("maps confirmed rows to new item drafts for every participant", () => {
    const participantIds = ["person-a", "person-b"];
    const items = createItemDraftsFromReceipt(
      confirmedRows,
      participantIds,
      4,
      (index) => "item-imported-" + index,
    );

    expect(items).toEqual([
      {
        id: "item-imported-0",
        name: "Pizza",
        priceSatang: 1200,
        payerIds: ["person-a", "person-b"],
        order: 4,
      },
      {
        id: "item-imported-1",
        name: "ชาเย็น",
        priceSatang: 7550,
        payerIds: ["person-a", "person-b"],
        order: 5,
      },
    ]);
    expect(confirmedRows[0].name).toBe("  Pizza  ");
    expect(participantIds).toEqual(["person-a", "person-b"]);
  });

  it("recognizes only positive confirmed rows as ready", () => {
    expect(isReceiptItemReady(confirmedRows[0])).toBe(true);
    expect(isReceiptItemReady({ ...confirmedRows[0], priceSatang: 0 })).toBe(false);
    expect(isReceiptItemReady({ ...confirmedRows[0], name: "   " })).toBe(false);
    expect(isReceiptItemReady({ ...confirmedRows[0], status: "needs-review" })).toBe(false);
  });

  it("preserves existing items and appends imported rows without fee fields", () => {
    const existing: ItemDraft = {
      id: "existing",
      name: "Existing item",
      priceSatang: 5000,
      payerIds: ["person-a"],
      vatPercent: 7,
      serviceChargePercent: 10,
      order: 0,
    };

    const result = appendReceiptItems(
      [existing],
      confirmedRows,
      ["person-a", "person-b"],
      (index) => "appended-" + index,
    );

    expect(result[0]).toBe(existing);
    expect(result.slice(1)).toEqual([
      {
        id: "appended-0",
        name: "Pizza",
        priceSatang: 1200,
        payerIds: ["person-a", "person-b"],
        order: 1,
      },
      {
        id: "appended-1",
        name: "ชาเย็น",
        priceSatang: 7550,
        payerIds: ["person-a", "person-b"],
        order: 2,
      },
    ]);
  });
});
