import { describe, expect, it } from "vitest";
import {
  billCreateBodySchema,
  billPatchBodySchema,
} from "../../lib/harn-tee/server-validation";

describe("server-side bill payload boundaries", () => {
  it("accepts an incomplete but structurally safe draft", () => {
    const result = billCreateBodySchema.safeParse({
      draft: true,
      participants: [{ id: "p1", name: "มิน", order: 0 }],
      items: [],
      vatPercent: 0,
      serviceChargePercent: 0,
    });

    expect(result.success).toBe(true);
  });

  it("rejects unexpected properties and excessive item counts", () => {
    const base = {
      draft: true,
      participants: [],
      items: [],
      vatPercent: 0,
      serviceChargePercent: 0,
    };

    expect(billCreateBodySchema.safeParse({ ...base, isAdmin: true }).success).toBe(false);
    expect(billCreateBodySchema.safeParse({ ...base, items: Array.from({ length: 501 }, (_, order) => ({
      id: `i${order}`,
      name: "รายการ",
      priceSatang: 0,
      payerIds: [],
      order,
    })) }).success).toBe(false);
  });

  it("allows publishing a bill but does not allow clients to set deleted status", () => {
    expect(billPatchBodySchema.safeParse({ status: "published" }).success).toBe(true);
    expect(billPatchBodySchema.safeParse({ status: "deleted" }).success).toBe(false);
    expect(billPatchBodySchema.safeParse({ status: "draft" }).success).toBe(false);
  });
});
