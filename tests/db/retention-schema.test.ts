import {afterEach,beforeEach,expect,it,vi} from "vitest";
const worker=vi.hoisted(()=>({env:{DB:null as unknown}}));
vi.mock("cloudflare:workers",()=>({env:worker.env}));
import {sqliteBillDb} from "../helpers/sqlite-bill-db";
import {buildBillDocument} from "../../db/document";
import {draftFixture,safeFixture} from "../helpers/draft-fixtures";
import {initializeLegacyRow,backfillLegacyBatch,type StoredBillRow} from "../../db/bill-retention-store";
import {revisionOf} from "../../db/draft-document";
import {createDraftOnce} from "../../db/repository";
import {createOpaqueToken} from "../../lib/harn-tee/tokens";
let database:ReturnType<typeof sqliteBillDb>;
beforeEach(()=>{database=sqliteBillDb();worker.env.DB=database.db;});
afterEach(()=>database.close());
const document=()=>buildBillDocument(draftFixture().draft,1000,"published");
async function row(id:string){return (await database.db.prepare("SELECT * FROM bills WHERE id=?").bind(id).first<StoredBillRow>())!;}
it("legacy_grace_is_once_for_paid_and_unpaid",async()=>{
  const unpaid=await database.seed(document()),paidDoc=document();paidDoc.participants[0].paid=true;
  const paid=await database.seed(paidDoc);
  const a=await initializeLegacyRow({DB:database.db},await row(unpaid.id),100000);
  const b=await initializeLegacyRow({DB:database.db},await row(paid.id),100000);
  expect(a).toMatchObject({last_activity_at:1000,all_paid_at:null,expires_at:2592100000,retention_version:1});
  expect(b).toMatchObject({last_activity_at:1000,all_paid_at:100000,expires_at:604900000,retention_version:1});
  expect(await initializeLegacyRow({DB:database.db},await row(paid.id),999999)).toEqual(b);
});
it("migration_preserves_payload_and_tokens",async()=>{
  database.close();database=sqliteBillDb(true);worker.env.DB=database.db;
  const seeded=await database.seed(document()),before=await row(seeded.id);
  database.migrate();expect((await row(seeded.id)).expires_at).toBeNull();
  await initializeLegacyRow({DB:database.db},await row(seeded.id),100000);
  const after=await row(seeded.id);
  expect(after.payload_json).toBe(before.payload_json);expect(after.edit_token_digest).toBe(before.edit_token_digest);expect(after.share_token_digest).toBe(before.share_token_digest);expect(after.updated_at).toBe(1000);
  expect(database.sqlite.prepare("SELECT rollout_at FROM bill_retention_policy WHERE id='lifecycle-v1'").get()?.rollout_at).toBeTypeOf("number");
});
it("changed_snapshot_skips_backfill",async()=>{
  const seeded=await database.seed(document()),snapshot=await row(seeded.id);
  database.sqlite.prepare("UPDATE bills SET payload_json=? WHERE id=?").run(JSON.stringify({...document(),title:"peer"}),seeded.id);
  expect(await initializeLegacyRow({DB:database.db},snapshot,100000)).toBeNull();
  expect((await row(seeded.id)).expires_at).toBeNull();
});
it("backfill_is_bounded_and_uses_the_single_rollout_time",async()=>{
  database.sqlite.prepare("UPDATE bill_retention_policy SET rollout_at=100000").run();
  await database.seed(document());await database.seed(document());
  expect(await backfillLegacyBatch({DB:database.db},1)).toBe(1);
  expect(database.sqlite.prepare("SELECT COUNT(*) AS n FROM bills WHERE expires_at IS NULL").get()?.n).toBe(1);
  expect(await backfillLegacyBatch({DB:database.db},20)).toBe(1);
  expect(database.sqlite.prepare("SELECT COUNT(*) AS n FROM bills WHERE expires_at=2592100000").get()?.n).toBe(2);
});
it("revision_includes_retention_version",async()=>{
  expect(await revisionOf("payload","digest",0)).not.toBe(await revisionOf("payload","digest",1));
});
it("new_drafts_have_a_deadline_without_legacy_backfill",async()=>{
  const created=await createDraftOnce(createOpaqueToken(),safeFixture()),stored=await row(created.id);
  expect(stored.expires_at).toBe(created.document.createdAt+2592000000);expect(stored.last_activity_at).toBe(created.document.createdAt);
});
