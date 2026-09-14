import { describe, expect, it } from "vitest";
import { calculateBill, formatBaht } from "../../lib/harn-tee/money";

describe("harn-tee bill calculation", () => {
  it("splits a one-person bill and applies VAT and service charge from the subtotal", () => {
    const result = calculateBill({
      participants: [{ id: "p1", name: "มิน", order: 0 }],
      items: [
        {
          id: "i1",
          name: "ข้าว",
          priceSatang: 10000,
          payerIds: ["p1"],
          order: 0,
        },
      ],
      vatPercent: 7,
      serviceChargePercent: 10,
    });

    expect(result.subtotalSatang).toBe(10000);
    expect(result.serviceChargeSatang).toBe(1000);
    expect(result.vatSatang).toBe(700);
    expect(result.grossTotalSatang).toBe(11700);
    expect(result.participants[0].amountDueSatang).toBe(11700);
    expect(result.collectedTotalSatang).toBe(11700);
  });

  it("rounds an inexact equal split up to the same amount for every payer", () => {
    const result = calculateBill({
      participants: [
        { id: "p1", name: "มิน", order: 0 },
        { id: "p2", name: "ปอ", order: 1 },
        { id: "p3", name: "นัท", order: 2 },
      ],
      items: [
        {
          id: "i1",
          name: "พิซซ่า",
          priceSatang: 10000,
          payerIds: ["p1", "p2", "p3"],
          order: 0,
        },
      ],
      vatPercent: 0,
      serviceChargePercent: 0,
    });

    expect(result.participants.map((person) => person.amountDueSatang)).toEqual([
      3334, 3334, 3334,
    ]);
    expect(result.collectedTotalSatang).toBe(10002);
    expect(result.roundingDifferenceSatang).toBe(2);
  });

  it("keeps each item traceable when people share different items", () => {
    const result = calculateBill({
      participants: [
        { id: "p1", name: "มิน", order: 0 },
        { id: "p2", name: "ปอ", order: 1 },
      ],
      items: [
        {
          id: "i1",
          name: "กาแฟ",
          priceSatang: 10000,
          payerIds: ["p1", "p2"],
          order: 0,
        },
        {
          id: "i2",
          name: "เค้ก",
          priceSatang: 5000,
          payerIds: ["p1"],
          order: 1,
        },
      ],
      vatPercent: 0,
      serviceChargePercent: 0,
    });

    expect(result.participants[0].amountDueSatang).toBe(10000);
    expect(result.participants[1].amountDueSatang).toBe(5000);
    expect(result.participants[0].lineItems).toEqual([
      {
        itemId: "i1",
        name: "กาแฟ",
        amountSatang: 5000,
        serviceChargeSatang: 0,
        vatSatang: 0,
        totalSatang: 5000,
      },
      {
        itemId: "i2",
        name: "เค้ก",
        amountSatang: 5000,
        serviceChargeSatang: 0,
        vatSatang: 0,
        totalSatang: 5000,
      },
    ]);
    expect(formatBaht(result.roundingDifferenceSatang)).toBe("0.00");
  });

  it("calculates VAT and service charge independently for each item", () => {
    const result = calculateBill({
      feeMode: "item",
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
          vatPercent: 7,
          serviceChargePercent: 10,
          order: 0,
        },
        {
          id: "i2",
          name: "น้ำเปล่า",
          priceSatang: 5000,
          payerIds: ["p1"],
          vatPercent: 5,
          serviceChargePercent: 10,
          order: 1,
        },
      ],
      vatPercent: 0,
      serviceChargePercent: 0,
    });

    expect(result.serviceChargeSatang).toBe(1500);
    expect(result.vatSatang).toBe(950);
    expect(result.grossTotalSatang).toBe(17450);
    expect(result.participants.map((person) => person.amountDueSatang)).toEqual([
      11600,
      5850,
    ]);
    expect(result.participants[0].lineItems).toEqual([
      {
        itemId: "i1",
        name: "พิซซ่า",
        amountSatang: 5000,
        serviceChargeSatang: 500,
        vatSatang: 350,
        totalSatang: 5850,
      },
      {
        itemId: "i2",
        name: "น้ำเปล่า",
        amountSatang: 5000,
        serviceChargeSatang: 500,
        vatSatang: 250,
        totalSatang: 5750,
      },
    ]);
  });
});
