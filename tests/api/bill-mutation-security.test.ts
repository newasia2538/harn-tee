import { describe, expect, it, vi } from "vitest";
import type { BillDocument, BillRecord } from "../../lib/harn-tee/types";

const repository = vi.hoisted(() => ({
  createBillRecord: vi.fn(),
  readBillByToken: vi.fn(),
  updateBillByEditToken: vi.fn(),
  deleteBillByEditToken: vi.fn(),
  setParticipantPaid: vi.fn(),
}));

vi.mock("../../db/repository", () => repository);

import { POST as createBill } from "../../app/api/bills/route";
import { PATCH as updateBill } from "../../app/api/bills/[token]/route";
import { POST as updatePaymentStatus } from "../../app/api/bills/[token]/status/route";

const current: BillDocument = {
  version: 1,
  status: "draft",
  title: "มื้อเย็น",
  participants: [{ id: "p1", name: "มิน", order: 0, paid: false, paidAt: null }],
  items: [{ id: "i1", name: "ข้าว", priceSatang: 10000, payerIds: ["p1"], order: 0 }],
  vatPercent: 7,
  serviceChargePercent: 10,
  recipient: {
    name: "มิน",
    bank: { bankId: "SCB", accountNumber: "1234567890" },
    promptPay: null,
    qr: null,
    visible: true,
  },
  createdAt: 1,
  updatedAt: 1,
};

describe("bill mutation input security", () => {
  it("rejects an oversized create request before parsing or persisting it", async () => {
    repository.createBillRecord.mockClear();
    const request = new Request("https://harn-tee.test/api/bills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: " ".repeat(1024 * 1024 + 1),
    });

    const response = await createBill(request);

    expect(response.status).toBe(413);
    expect(repository.createBillRecord).not.toHaveBeenCalled();
  });

  it("allows a bounded incomplete draft while rejecting malformed object shapes", async () => {
    repository.createBillRecord.mockClear();
    repository.createBillRecord.mockResolvedValue({ id: "new", shareToken: "s", editToken: "e", document: current });
    const draftRequest = new Request("https://harn-tee.test/api/bills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        draft: true,
        participants: [{ id: "p1", name: "มิน", order: 0 }],
        items: [],
        vatPercent: 0,
        serviceChargePercent: 0,
      }),
    });
    const accepted = await createBill(draftRequest);
    expect(accepted.status).toBe(200);

    const malformed = await createBill(new Request("https://harn-tee.test/api/bills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft: true, participants: "not-an-array" }),
    }));
    expect(malformed.status).toBe(400);
  });

  it("rejects an attempt to change the lifecycle status through a bill patch", async () => {
    const editRecord: BillRecord = { id: "bill-1", document: current, access: "edit" };
    repository.readBillByToken.mockResolvedValue(editRecord);
    repository.updateBillByEditToken.mockClear();

    const response = await updateBill(
      new Request("https://harn-tee.test/api/bills/edit-key", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "deleted" }),
      }),
      { params: Promise.resolve({ token: "edit-key" }) },
    );

    expect(response.status).toBe(400);
    expect(repository.updateBillByEditToken).not.toHaveBeenCalled();
  });

  it("rejects unknown patch properties instead of persisting them", async () => {
    const editRecord: BillRecord = { id: "bill-1", document: current, access: "edit" };
    repository.readBillByToken.mockResolvedValue(editRecord);
    repository.updateBillByEditToken.mockClear();

    const response = await updateBill(
      new Request("https://harn-tee.test/api/bills/edit-key", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "ใหม่", isAdmin: true }),
      }),
      { params: Promise.resolve({ token: "edit-key" }) },
    );

    expect(response.status).toBe(400);
    expect(repository.updateBillByEditToken).not.toHaveBeenCalled();
  });

  it("bounds and strictly validates public payment-status requests", async () => {
    repository.setParticipantPaid.mockClear();
    const tooLarge = await updatePaymentStatus(
      new Request("https://harn-tee.test/api/bills/share-key/status", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": "5000" },
        body: JSON.stringify({ participantId: "p1", paid: true }),
      }),
      { params: Promise.resolve({ token: "share-key" }) },
    );
    expect(tooLarge.status).toBe(413);

    const unexpected = await updatePaymentStatus(
      new Request("https://harn-tee.test/api/bills/share-key/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId: "p1", paid: true, role: "admin" }),
      }),
      { params: Promise.resolve({ token: "share-key" }) },
    );
    expect(unexpected.status).toBe(400);
    expect(repository.setParticipantPaid).not.toHaveBeenCalled();
  });

  it("does not return sensitive recipient values from the shared payment-status endpoint", async () => {
    repository.setParticipantPaid.mockResolvedValue(current);
    const response = await updatePaymentStatus(
      new Request("https://harn-tee.test/api/bills/share-key/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId: "p1", paid: true }),
      }),
      { params: Promise.resolve({ token: "share-key" }) },
    );
    const body = await response.json() as { participants?: unknown; document?: unknown };

    expect(body.participants).toEqual(current.participants);
    expect(body.document).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("1234567890");
  });
});
