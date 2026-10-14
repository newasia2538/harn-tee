import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BillDocument, BillRecord } from "../../lib/harn-tee/types";

const repository = vi.hoisted(() => ({
  readBillByToken: vi.fn(),
  deleteBillByEditToken: vi.fn(),
  updateBillByEditToken: vi.fn(),
}));

vi.mock("../../db/repository", () => repository);

import { GET as getBill } from "../../app/api/bills/[token]/route";
import { GET as getPaymentDetail } from "../../app/api/bills/[token]/payment-details/route";

const document: BillDocument = {
  version: 1,
  status: "published",
  title: "มื้อเย็น",
  participants: [{ id: "p1", name: "มิน", order: 0, paid: false, paidAt: null }],
  items: [{ id: "i1", name: "ข้าว", priceSatang: 10000, payerIds: ["p1"], order: 0 }],
  vatPercent: 0,
  serviceChargePercent: 0,
  recipient: {
    name: "มิน",
    bank: { bankId: "SCB", accountNumber: "1234567890" },
    promptPay: { type: "national-id", value: "1234567890123" },
    qr: { objectKey: "bills/secret/qr.png", contentType: "image/png", size: 20 },
    visible: true,
  },
  createdAt: 1,
  updatedAt: 1,
};

function record(access: "share" | "edit", bill = document): BillRecord {
  return { id: "bill-1", document: bill, access };
}

type BillResponseBody = {
  document: BillDocument;
  payment: { qrAvailable: boolean };
  error?: string;
};

async function responseJson(response: Response): Promise<BillResponseBody> {
  return await response.json() as BillResponseBody;
}

beforeEach(() => {
  repository.readBillByToken.mockReset();
  repository.readBillByToken.mockImplementation(async (kind: "share" | "edit") =>
    kind === "share" ? record("share") : null,
  );
});

describe("bill payment data access", () => {
  it("returns masked payment values and no QR object key on the share document", async () => {
    const response = await getBill(new Request("https://harn-tee.test/api/bills/share-key"), {
      params: Promise.resolve({ token: "share-key" }),
    });
    const body = await responseJson(response);

    expect(body.document.recipient.bank?.accountNumber).toBe("••••••••7890");
    expect(body.document.recipient.promptPay?.value).toBe("••••••••0123");
    expect(body.document.recipient.qr).toBeNull();
    expect(body.payment.qrAvailable).toBe(true);
    expect(JSON.stringify(body)).not.toContain("1234567890");
    expect(JSON.stringify(body)).not.toContain("bills/secret/qr.png");
  });

  it("does not expose payment availability when the recipient hid payment details", async () => {
    repository.readBillByToken.mockImplementation(async (kind: "share" | "edit") =>
      kind === "share"
        ? record("share", { ...document, recipient: { ...document.recipient, visible: false } })
        : null,
    );

    const response = await getBill(new Request("https://harn-tee.test/api/bills/share-key"), {
      params: Promise.resolve({ token: "share-key" }),
    });
    const body = await responseJson(response);

    expect(body.document.recipient.bank).toBeNull();
    expect(body.document.recipient.promptPay).toBeNull();
    expect(body.document.recipient.qr).toBeNull();
    expect(body.payment.qrAvailable).toBe(false);
  });

  it("keeps full payment details available to the edit-token owner", async () => {
    repository.readBillByToken.mockImplementation(async (kind: "share" | "edit") =>
      kind === "edit" ? record("edit") : null,
    );

    const response = await getBill(new Request("https://harn-tee.test/api/bills/edit-key"), {
      params: Promise.resolve({ token: "edit-key" }),
    });
    const body = await responseJson(response);

    expect(body.document.recipient.bank?.accountNumber).toBe("1234567890");
    expect(body.document.recipient.promptPay?.value).toBe("1234567890123");
    expect(body.document.recipient.qr?.objectKey).toBe("bills/secret/qr.png");
  });

  it("keeps hidden payment details and QR available to the edit-token owner", async () => {
    repository.readBillByToken.mockImplementation(async (kind: "share" | "edit") =>
      kind === "edit"
        ? record("edit", { ...document, recipient: { ...document.recipient, visible: false } })
        : null,
    );

    const response = await getBill(new Request("https://harn-tee.test/api/bills/edit-key"), {
      params: Promise.resolve({ token: "edit-key" }),
    });
    const body = await responseJson(response);

    expect(body.document.recipient.bank?.accountNumber).toBe("1234567890");
    expect(body.payment.qrAvailable).toBe(true);
  });

  it("returns only the requested full value to a valid share-link request and disables caching", async () => {
    const response = await getPaymentDetail(
      new Request("https://harn-tee.test/api/bills/share-key/payment-details?field=bank"),
      { params: Promise.resolve({ token: "share-key" }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(await responseJson(response)).toEqual({ value: "1234567890" });
  });

  it("returns the full PromptPay identifier only after that field is explicitly requested", async () => {
    const response = await getPaymentDetail(
      new Request("https://harn-tee.test/api/bills/share-key/payment-details?field=promptPay"),
      { params: Promise.resolve({ token: "share-key" }) },
    );

    expect(response.status).toBe(200);
    expect(await responseJson(response)).toEqual({ value: "1234567890123" });
  });

  it("refuses to reveal payment details through a share token when sharing is disabled", async () => {
    repository.readBillByToken.mockImplementation(async (kind: "share" | "edit") =>
      kind === "share"
        ? record("share", { ...document, recipient: { ...document.recipient, visible: false } })
        : null,
    );

    const response = await getPaymentDetail(
      new Request("https://harn-tee.test/api/bills/share-key/payment-details?field=bank"),
      { params: Promise.resolve({ token: "share-key" }) },
    );

    expect(response.status).toBe(404);
  });

  it("rejects unknown fields and unknown tokens", async () => {
    const invalidField = await getPaymentDetail(
      new Request("https://harn-tee.test/api/bills/share-key/payment-details?field=qr"),
      { params: Promise.resolve({ token: "share-key" }) },
    );
    expect(invalidField.status).toBe(400);

    repository.readBillByToken.mockResolvedValue(null);
    const invalidToken = await getPaymentDetail(
      new Request("https://harn-tee.test/api/bills/unknown/payment-details?field=bank"),
      { params: Promise.resolve({ token: "unknown" }) },
    );
    expect(invalidToken.status).toBe(404);
  });
});
