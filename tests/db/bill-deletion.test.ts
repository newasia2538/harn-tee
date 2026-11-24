import {afterEach,beforeEach,expect,it,vi} from "vitest";
const worker=vi.hoisted(()=>({env:{DB:null as unknown,BUCKET:undefined as unknown}}));
vi.mock("cloudflare:workers",()=>({env:worker.env}));
import {sqliteBillDb} from "../helpers/sqlite-bill-db";
import {qrBucket} from "../helpers/qr-bucket";
import {safeFixture} from "../helpers/draft-fixtures";
import {createOpaqueToken} from "../../lib/harn-tee/tokens";
import {createDraftOnce,deleteBillByEditToken,saveDraftCheckpoint} from "../../db/repository";
import {revokeBillSnapshot,drainBillQrCleanup} from "../../db/bill-deletion";
import {runBillMaintenance} from "../../db/bill-maintenance";
import type {StoredBillRow} from "../../db/bill-retention-store";
let database:ReturnType<typeof sqliteBillDb>,r2:ReturnType<typeof qrBucket>;
beforeEach(()=>{vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(100000);database=sqliteBillDb();r2=qrBucket();worker.env.DB=database.db;worker.env.BUCKET=r2.bucket;});
afterEach(()=>{database.close();vi.useRealTimers();});
const bindings=()=>({DB:database.db,BUCKET:r2.bucket});
async function row(id:string){return (await database.db.prepare("SELECT * FROM bills WHERE id=?").bind(id).first<StoredBillRow>())!;}
it("revocation_erases_payload_before_r2_work",async()=>{
  const first=await createDraftOnce(createOpaqueToken(),safeFixture()),key=`bills/${first.id}/legacy.png`;
  r2.objects.set(key,new Uint8Array([1,2,3]));
  expect(await revokeBillSnapshot(bindings(),await row(first.id),"manual",100000)).toBe("revoked");
  expect(await row(first.id)).toBeNull();expect(r2.objects.has(key)).toBe(true);
  const marker=database.sqlite.prepare("SELECT * FROM bill_deletions WHERE id=?").get(first.id)!;
  expect(marker.state).toBe("deleting");expect(JSON.stringify(marker)).not.toContain("1234567890");expect(JSON.stringify(marker)).not.toContain(first.editToken);
  expect(await drainBillQrCleanup(bindings(),first.id,100000,20)).toBe("deleted");
  expect(r2.objects.has(key)).toBe(false);expect(database.sqlite.prepare("SELECT COUNT(*) AS n FROM bill_qr_assets").get()?.n).toBe(0);
});
it("expiry_snapshot_cannot_delete_extended_bill",async()=>{
  const first=await createDraftOnce(createOpaqueToken(),safeFixture());database.sqlite.prepare("UPDATE bills SET expires_at=100000 WHERE id=?").run(first.id);
  const snapshot=await row(first.id);database.sqlite.prepare("UPDATE bills SET expires_at=300000,retention_version=retention_version+1 WHERE id=?").run(first.id);
  expect(await revokeBillSnapshot(bindings(),snapshot,"expired",100000)).toBe("conflict");
  expect(await row(first.id)).not.toBeNull();expect(database.sqlite.prepare("SELECT COUNT(*) AS n FROM bill_deletions").get()?.n).toBe(0);
});
it("manual_delete_rejects_stale_revision",async()=>{
  const first=await createDraftOnce(createOpaqueToken(),safeFixture()),form=safeFixture();form.draft.title="peer";
  await saveDraftCheckpoint(first.editToken,first.revision,form);
  await expect(deleteBillByEditToken(first.editToken,first.revision)).rejects.toThrow("revision-conflict");
  expect(await row(first.id)).not.toBeNull();expect(r2.deleted).toHaveLength(0);
});
it("r2_delete_failure_is_pending_and_retry_survives_new_bindings",async()=>{
  const first=await createDraftOnce(createOpaqueToken(),safeFixture()),key=`bills/${first.id}/qr.png`;
  r2.objects.set(key,new Uint8Array([1]));r2.hooks.failDelete=true;
  expect(await deleteBillByEditToken(first.editToken,first.revision)).toMatchObject({state:"deleting"});
  expect(await row(first.id)).toBeNull();expect(r2.objects.has(key)).toBe(true);
  r2.hooks.failDelete=false;
  expect(await drainBillQrCleanup({DB:database.db,BUCKET:r2.bucket},first.id,130000,20)).toBe("deleted");
  expect(r2.objects.has(key)).toBe(false);
});
it("same_creation_key_cannot_resurrect_and_repeated_delete_is_idempotent",async()=>{
  const key=createOpaqueToken(),first=await createDraftOnce(key,safeFixture());
  expect(await deleteBillByEditToken(first.editToken,first.revision)).toMatchObject({state:"deleted"});
  expect(await deleteBillByEditToken(first.editToken,first.revision)).toMatchObject({state:"deleted"});
  await expect(createDraftOnce(key,safeFixture())).rejects.toMatchObject({code:"bill-deleted"});
});
it("legacy_replaced_object_is_swept_without_touching_another_bill",async()=>{
  const first=await createDraftOnce(createOpaqueToken(),safeFixture());
  r2.objects.set(`bills/${first.id}/replaced.png`,new Uint8Array([1]));r2.objects.set("bills/other/private.png",new Uint8Array([2]));
  expect(await deleteBillByEditToken(first.editToken,first.revision)).toMatchObject({state:"deleted"});
  expect([...r2.objects.keys()]).toEqual(["bills/other/private.png"]);
});
it("missing_bucket_keeps_cleanup_pending_instead_of_claiming_success",async()=>{
  const first=await createDraftOnce(createOpaqueToken(),safeFixture());
  await revokeBillSnapshot(bindings(),await row(first.id),"manual",100000);
  expect(await drainBillQrCleanup({DB:database.db},first.id,100000,20)).toBe("deleting");
});
it("maintenance_uses_current_expiry_and_is_globally_throttled",async()=>{
  const first=await createDraftOnce(createOpaqueToken(),safeFixture());database.sqlite.prepare("UPDATE bills SET expires_at=100000 WHERE id=?").run(first.id);
  await runBillMaintenance(bindings(),100000);expect(await row(first.id)).toBeNull();
  const second=await createDraftOnce(createOpaqueToken(),safeFixture());database.sqlite.prepare("UPDATE bills SET expires_at=100000 WHERE id=?").run(second.id);
  await runBillMaintenance(bindings(),100001);expect(await row(second.id)).not.toBeNull();
  await runBillMaintenance(bindings(),160000);expect(await row(second.id)).toBeNull();
});
it("late_list_response_cannot_repopulate_a_completed_marker",async()=>{
  const first=await createDraftOnce(createOpaqueToken(),safeFixture());
  for(const name of ["a","b"])r2.objects.set(`bills/${first.id}/${name}.png`,new Uint8Array([1]));
  await revokeBillSnapshot(bindings(),await row(first.id),"manual",100000);
  let release!:()=>void,started!:()=>void;const waiting=new Promise<void>(resolve=>{release=resolve;}),listed=new Promise<void>(resolve=>{started=resolve;});
  r2.hooks.beforeListReturn=async()=>{r2.hooks.beforeListReturn=undefined;started();await waiting;};
  const late=drainBillQrCleanup(bindings(),first.id,100000,1);await listed;
  expect(await drainBillQrCleanup(bindings(),first.id,100000,20)).toBe("deleted");
  release();expect(await late).toBe("deleted");
  expect(database.sqlite.prepare("SELECT COUNT(*) AS n FROM bill_qr_assets WHERE bill_id=?").get(first.id)?.n).toBe(0);
});
it("cleanup_is_bounded_and_continues_the_prefix_cursor",async()=>{
  const first=await createDraftOnce(createOpaqueToken(),safeFixture());
  for(let n=0;n<125;n++)r2.objects.set(`bills/${first.id}/${String(n).padStart(3,"0")}.png`,new Uint8Array([1]));
  await revokeBillSnapshot(bindings(),await row(first.id),"manual",100000);
  expect(await drainBillQrCleanup(bindings(),first.id,100000,20)).toBe("deleting");expect(r2.objects.size).toBe(105);
  for(let n=1;n<7;n++)await drainBillQrCleanup(bindings(),first.id,100000+n*30000,20);
  expect(r2.objects.size).toBe(0);expect(database.sqlite.prepare("SELECT state FROM bill_deletions WHERE id=?").get(first.id)?.state).toBe("deleted");
});
