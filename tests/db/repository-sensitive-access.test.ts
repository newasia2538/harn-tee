import { afterEach,beforeEach, describe, expect, it, vi } from "vitest";

const worker = vi.hoisted(() => ({ env: { DB: null as unknown, BUCKET: null as unknown } }));

vi.mock("cloudflare:workers", () => ({ env: worker.env }));

import { deleteBillByEditToken, readQrByToken,readEditCheckpoint } from "../../db/repository";
import { hashToken } from "../../lib/harn-tee/tokens";
import {conditionalBillDb,type TestBillRow} from "../helpers/conditional-bill-db";

const shareToken = "share-token-for-test";
const editToken = "edit-token-for-test";
let row:TestBillRow,database:ReturnType<typeof conditionalBillDb>;
const files=new Set<string>();
const bucket = {
  get: vi.fn(async (key: string) => ({ body: key, httpMetadata: { contentType: "image/png" } })),
  delete: vi.fn(async (keys:string|string[]) => {for(const key of typeof keys==="string"?[keys]:keys)files.delete(key);}),
  list:vi.fn(async()=>({objects:[...files].map(key=>({key})),truncated:false,delimitedPrefixes:[]})),
};

function installDb() {
  database=conditionalBillDb();database.rows.set(row.id,row);row=database.rows.get(row.id)!;
  worker.env.DB = database.db;
  worker.env.BUCKET = bucket;
}

beforeEach(async () => {
  row={id:"bill-1",share_token_digest:"",edit_token_digest:"",payload_json:"",created_at:1,updated_at:1,last_activity_at:1,all_paid_at:null,expires_at:Date.now()+2592000000,retention_version:0};
  files.clear();files.add("bills/bill-1/qr.png");
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
afterEach(()=>database.close());

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
    const ack=await readEditCheckpoint(editToken);
    expect(await deleteBillByEditToken(editToken,ack!.revision)).toMatchObject({state:"deleted"});

    expect(bucket.delete).toHaveBeenCalledWith(["bills/bill-1/qr.png"]);
    expect(database.rows.get("bill-1")).toBeUndefined();expect(files.size).toBe(0);
  });
});
