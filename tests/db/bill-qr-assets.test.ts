import {afterEach,beforeEach,expect,it,vi} from "vitest";
const worker=vi.hoisted(()=>({env:{DB:null as unknown,BUCKET:undefined as unknown}}));
vi.mock("cloudflare:workers",()=>({env:worker.env}));
import {sqliteBillDb} from "../helpers/sqlite-bill-db";
import {qrBucket} from "../helpers/qr-bucket";
import {safeFixture} from "../helpers/draft-fixtures";
import {createOpaqueToken} from "../../lib/harn-tee/tokens";
import {createDraftOnce,saveQrForEditToken} from "../../db/repository";
import {revokeBillSnapshot,drainBillQrCleanup} from "../../db/bill-deletion";
import {registerQrAsset,settleQrAsset,queueQrCleanup} from "../../db/bill-qr-assets";
import type {StoredBillRow} from "../../db/bill-retention-store";
let database:ReturnType<typeof sqliteBillDb>,r2:ReturnType<typeof qrBucket>;
beforeEach(()=>{vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(100000);database=sqliteBillDb();r2=qrBucket();worker.env.DB=database.db;worker.env.BUCKET=r2.bucket;});
afterEach(()=>{database.close();vi.useRealTimers();});
const bindings=()=>({DB:database.db,BUCKET:r2.bucket});
async function row(id:string){return (await database.db.prepare("SELECT * FROM bills WHERE id=?").bind(id).first<StoredBillRow>())!;}
it("put_finishes_after_revocation_without_restoring_bill_or_leaving_qr",async()=>{
  const first=await createDraftOnce(createOpaqueToken(),safeFixture());
  let release!:()=>void,started!:()=>void;const waiting=new Promise<void>(resolve=>{release=resolve;}),putStarted=new Promise<void>(resolve=>{started=resolve;});
  r2.hooks.beforePut=async()=>{started();await waiting;};
  const uploading=saveQrForEditToken(first.editToken,new File([new Uint8Array([1,2])],"qr.png",{type:"image/png"}),{revision:first.revision,mode:"draft",selectionId:"selection"});
  void uploading.catch(()=>undefined);await putStarted;
  expect(database.sqlite.prepare("SELECT put_settled FROM bill_qr_assets WHERE bill_id=?").get(first.id)?.put_settled).toBe(0);
  await revokeBillSnapshot(bindings(),await row(first.id),"manual",100000);
  expect(await drainBillQrCleanup(bindings(),first.id,100000,20)).toBe("deleting");
  release();await expect(uploading).rejects.toThrow("revision-conflict");
  expect(await drainBillQrCleanup(bindings(),first.id,130000,20)).toBe("deleted");
  expect(r2.objects.size).toBe(0);expect(await row(first.id)).toBeNull();
});
it("uncertain_put_survives_restart_and_time_alone_does_not_complete_deletion",async()=>{
  const first=await createDraftOnce(createOpaqueToken(),safeFixture()),key=`bills/${first.id}/uncertain.png`;
  expect(await registerQrAsset(bindings(),await row(first.id),key,"s",100000)).toBe(true);
  await settleQrAsset(bindings(),key,"uncertain",100000);await queueQrCleanup(bindings(),key,100000);
  await revokeBillSnapshot(bindings(),await row(first.id),"manual",100000);
  expect(await drainBillQrCleanup({DB:database.db,BUCKET:r2.bucket},first.id,9999999999,20)).toBe("deleting");
  expect(database.sqlite.prepare("SELECT put_settled FROM bill_qr_assets WHERE object_key=?").get(key)?.put_settled).toBe(0);
});
it("registration_rejects_foreign_keys_expired_rows_and_repeated_keys",async()=>{
  const first=await createDraftOnce(createOpaqueToken(),safeFixture()),snapshot=await row(first.id),key=`bills/${first.id}/q.png`;
  await expect(registerQrAsset(bindings(),snapshot,"bills/other/q.png",undefined,100000)).rejects.toThrow("invalid-qr-key");
  expect(await registerQrAsset(bindings(),snapshot,key,undefined,100000)).toBe(true);
  expect(await registerQrAsset(bindings(),snapshot,key,undefined,100000)).toBe(false);
  expect(await registerQrAsset(bindings(),snapshot,`bills/${first.id}/late.png`,undefined,2592100000)).toBe(false);
});
