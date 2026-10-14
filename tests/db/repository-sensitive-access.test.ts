import { beforeEach, describe, expect, it, vi } from "vitest";

const worker = vi.hoisted(() => ({ env: { DB: null as unknown, BUCKET: null as unknown } }));

vi.mock("cloudflare:workers", () => ({ env: worker.env }));

import { deleteBillByEditToken, readQrByToken } from "../../db/repository";
import { hashToken } from "../../lib/harn-tee/tokens";

const shareToken = "share-token-for-test";
const editToken = "edit-token-for-test";
const row = {
  id: "bill-1",
  share_token_digest: "",
  edit_token_digest: "",
  payload_json: "",
  created_at: 1,
  updated_at: 1,
};
const calls: Array<{ sql: string; values: unknown[] }> = [];
const bucket = {
  get: vi.fn(async (key: string) => ({ body: key, httpMetadata: { contentType: "image/png" } })),
  delete: vi.fn(async () => undefined),
};

function installDb() {
  worker.env.DB = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async first() {
              const digest = values[0];
              return digest === row.share_token_digest || digest === row.edit_token_digest
                ? row
                : null;
            },
            async run() {
              calls.push({ sql, values });
              return { success: true };
            },
          };
        },
      };
    },
  };
  worker.env.BUCKET = bucket;
}

beforeEach(async () => {
  calls.length = 0;
  bucket.get.mockClear();
  bucket.delete.mockClear();
  row.share_token_digest = await hashToken(shareToken);
  row.edit_token_digest = await hashToken(editToken);
  row.payload_json = JSON.stringify({
    version: 1,
    status: "published",
    title: "ทดสอบ",
    participants: [],
    items: [],
    vatPercent: 0,
    serviceChargePercent: 0,
    recipient: {
      name: "เจ้าของบิล",
      bank: null,
      promptPay: null,
      qr: { objectKey: "bills/bill-1/qr.png", contentType: "image/png", size: 20 },
      visible: true,
    },
    createdAt: 1,
    updatedAt: 1,
  });
  installDb();
});

describe("sensitive bill storage access", () => {
  it("does not serve a hidden QR through the share token", async () => {
    row.payload_json = JSON.stringify({
      ...JSON.parse(row.payload_json),
      recipient: { ...JSON.parse(row.payload_json).recipient, visible: false },
    });

    expect(await readQrByToken(shareToken)).toBeNull();
    expect(bucket.get).not.toHaveBeenCalled();
  });

  it("still permits the edit-token owner to load a hidden QR", async () => {
    row.payload_json = JSON.stringify({
      ...JSON.parse(row.payload_json),
      recipient: { ...JSON.parse(row.payload_json).recipient, visible: false },
    });

    expect(await readQrByToken(editToken)).toMatchObject({ body: "bills/bill-1/qr.png" });
    expect(bucket.get).toHaveBeenCalledWith("bills/bill-1/qr.png");
  });

  it("removes the QR object and bill row when an owner deletes a bill", async () => {
    await deleteBillByEditToken(editToken);

    expect(bucket.delete).toHaveBeenCalledWith("bills/bill-1/qr.png");
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toMatch(/^DELETE FROM bills/);
  });
});
