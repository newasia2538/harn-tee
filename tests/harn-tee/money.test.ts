import { describe, expect, it } from "vitest";
import { calculateBill, formatBaht } from "../../lib/harn-tee/money";

describe("harn-tee bill calculation", () => {
  it("calculates VAT after bill-level service charge", () => {
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
    expect(result.vatSatang).toBe(770);
    expect(result.grossTotalSatang).toBe(11770);
    expect(result.participants[0].amountDueSatang).toBe(11770);
    expect(result.collectedTotalSatang).toBe(11770);
  });

  it("allocates bill-level VAT after each item's allocated service charge", () => {
    const result = calculateBill({
      participants: [
        { id: "p1", name: "มิน", order: 0 },
        { id: "p2", name: "ปอ", order: 1 },
      ],
      items: [
        {
          id: "i1",
          name: "พิซซ่า",
          priceSatang: 10000,
          payerIds: ["p1"],
          order: 0,
        },
        {
          id: "i2",
          name: "น้ำเปล่า",
          priceSatang: 5000,
          payerIds: ["p2"],
          order: 1,
        },
      ],
      vatPercent: 7,
      serviceChargePercent: 10,
    });

    expect(result.serviceChargeSatang).toBe(1500);
    expect(result.vatSatang).toBe(1155);
    expect(result.grossTotalSatang).toBe(17655);
    expect(result.participants.map((person) => person.amountDueSatang)).toEqual([
      11770,
      5885,
    ]);
    expect(result.participants[0].lineItems[0]).toMatchObject({
      serviceChargeSatang: 1000,
      vatSatang: 770,
      totalSatang: 11770,
    });
    expect(result.participants[1].lineItems[0]).toMatchObject({
      serviceChargeSatang: 500,
      vatSatang: 385,
      totalSatang: 5885,
    });
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

  it("calculates each item's VAT after that item's service charge", () => {
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
    expect(result.vatSatang).toBe(1045);
    expect(result.grossTotalSatang).toBe(17545);
    expect(result.participants.map((person) => person.amountDueSatang)).toEqual([
      11660,
      5885,
    ]);
    expect(result.participants[0].lineItems).toEqual([
      {
        itemId: "i1",
        name: "พิซซ่า",
        amountSatang: 5000,
        serviceChargeSatang: 500,
        vatSatang: 385,
        totalSatang: 5885,
      },
      {
        itemId: "i2",
        name: "น้ำเปล่า",
        amountSatang: 5000,
        serviceChargeSatang: 500,
        vatSatang: 275,
        totalSatang: 5775,
      },
    ]);
  });
});
