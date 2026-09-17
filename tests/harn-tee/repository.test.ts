import { describe, expect, it } from "vitest";
import {
  applyBillPatch,
  buildBillDocument,
} from "../../db/document";

const draft = {
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

describe("harn-tee bill documents", () => {
  it("builds a document with unpaid participants and a draft status", () => {
    const document = buildBillDocument(draft);

    expect(document.status).toBe("draft");
    expect(document.feeMode).toBe("bill");
    expect(document.calculationMode).toBe("vat-after-service");
    expect(document.participants.map((person) => person.paid)).toEqual([
      false,
      false,
    ]);
    expect(document.recipient).toEqual({
      name: "",
      bank: null,
      promptPay: null,
      qr: null,
      visible: true,
    });
  });

  it("preserves item-level fee settings in a document", () => {
    const document = buildBillDocument({
      ...draft,
      feeMode: "item",
      items: [{ ...draft.items[0], vatPercent: 7, serviceChargePercent: 10 }],
    });

    expect(document.feeMode).toBe("item");
    expect(document.items[0].vatPercent).toBe(7);
    expect(document.items[0].serviceChargePercent).toBe(10);
  });

  it("stores the selected VAT calculation formula", () => {
    const document = buildBillDocument({
      ...draft,
      calculationMode: "separate",
    });

    expect(document.calculationMode).toBe("separate");

    const updated = applyBillPatch(document, {
      calculationMode: "vat-after-service",
    });

    expect(updated.calculationMode).toBe("vat-after-service");
  });

  it("clears payment statuses when a financial patch is applied", () => {
    const document = {
      ...buildBillDocument(draft),
      participants: buildBillDocument(draft).participants.map((person) => ({
        ...person,
        paid: true,
      })),
    };

    const updated = applyBillPatch(document, {
      vatPercent: 8,
      participants: document.participants.map((person) => ({
        id: person.id,
        name: person.name,
        order: person.order,
        paid: person.paid,
        paidAt: person.paidAt,
      })),
    });

    expect(updated.participants.every((person) => !person.paid)).toBe(true);
    expect(updated.vatPercent).toBe(8);
  });
});
