import {afterEach,beforeEach,expect,it,vi} from "vitest";
const worker=vi.hoisted(()=>({env:{DB:null as unknown,BUCKET:undefined as unknown}}));
vi.mock("cloudflare:workers",()=>({env:worker.env}));
import {createDraftOnce,readEditCheckpoint,saveDraftCheckpoint,publishCheckpoint,setParticipantPaid,readBillByToken,issueDraftShareCapability} from "../../db/repository";
import {sqliteBillDb} from "../helpers/sqlite-bill-db";
import {draftFixture,safeFixture} from "../helpers/draft-fixtures";
import {createOpaqueToken} from "../../lib/harn-tee/tokens";
import * as tokens from "../../lib/harn-tee/tokens";
import {buildBillDocument} from "../../db/document";
let database:ReturnType<typeof sqliteBillDb>;
beforeEach(()=>{vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(100000);database=sqliteBillDb();worker.env.DB=database.db;});
afterEach(()=>{database.close();vi.useRealTimers();vi.restoreAllMocks();});
it("no_op_and_step_only_draft_saves_preserve_lifetime",async()=>{
  const first=await createDraftOnce(createOpaqueToken(),safeFixture());vi.setSystemTime(200000);
  const form=safeFixture();form.step=1;
  const result=await saveDraftCheckpoint(first.editToken,first.revision,form);
  expect(result).toMatchObject({kind:"ok",value:{lifecycle:{lastActivityAt:100000,allPaidAt:null,expiresAt:2592100000}}});
  expect((await readEditCheckpoint(first.editToken))?.form?.step).toBe(1);
});
it("changed_raw_draft_input_renews_even_before_complete_price",async()=>{
  const first=await createDraftOnce(createOpaqueToken(),safeFixture()),form=safeFixture();form.numbers.prices.i1="7.";vi.setSystemTime(200000);
  const result=await saveDraftCheckpoint(first.editToken,first.revision,form);
  expect(result).toMatchObject({kind:"ok",value:{lifecycle:{lastActivityAt:200000,expiresAt:2592200000},form:{numbers:{prices:{i1:"7."}}}}});
});
it("identical_publication_preserves_paid_flags_and_seven_day_deadline",async()=>{
  const first=await createDraftOnce(createOpaqueToken(),safeFixture());
  const published=await publishCheckpoint(first.editToken,first.revision,draftFixture(),"c1",first.shareToken);
  if(published.kind!=="ok")throw new Error("fixture publication failed");
  vi.setSystemTime(200000);const paid=await setParticipantPaid(first.editToken,"p1",true,published.value.revision);
  expect(paid?.lifecycle).toMatchObject({paymentStatus:"paid",allPaidAt:200000,expiresAt:605000000});
  vi.setSystemTime(300000);const repeated=await publishCheckpoint(first.editToken,paid!.revision,draftFixture(),"c2");
  expect(repeated).toMatchObject({kind:"ok",value:{lastConfirmationId:"c2",document:{participants:[{paid:true}]},lifecycle:{lastActivityAt:200000,allPaidAt:200000,expiresAt:605000000}}});
});
it("financial_edit_resets_flags_and_reversion_starts_thirty_days",async()=>{
  const first=await createDraftOnce(createOpaqueToken(),safeFixture());const pub=await publishCheckpoint(first.editToken,first.revision,draftFixture(),"c1",first.shareToken);
  if(pub.kind!=="ok")throw new Error("fixture publication failed");
  vi.setSystemTime(200000);const paid=await setParticipantPaid(first.editToken,"p1",true,pub.value.revision);
  vi.setSystemTime(300000);const form=draftFixture();form.numbers.prices.i1="200";
  const edited=await publishCheckpoint(first.editToken,paid!.revision,form,"c2");
  expect(edited).toMatchObject({kind:"ok",value:{document:{participants:[{paid:false}]},lifecycle:{paymentStatus:"unpaid",allPaidAt:null,lastActivityAt:300000,expiresAt:2592300000}}});
});
it("repeated_paid_flag_is_no_op_and_unknown_payer_is_rejected",async()=>{
  const first=await createDraftOnce(createOpaqueToken(),safeFixture());const pub=await publishCheckpoint(first.editToken,first.revision,draftFixture(),"c1",first.shareToken);
  if(pub.kind!=="ok")throw new Error("fixture publication failed");
  vi.setSystemTime(200000);const paid=await setParticipantPaid(first.editToken,"p1",true,pub.value.revision);
  vi.setSystemTime(300000);const same=await setParticipantPaid(first.editToken,"p1",true,paid!.revision);
  expect(same?.revision).toBe(paid?.revision);expect(same?.lifecycle).toEqual(paid?.lifecycle);
  await expect(setParticipantPaid(first.editToken,"absent",true,same!.revision)).rejects.toThrow("invalid-bill");
  const reverted=await setParticipantPaid(first.editToken,"p1",false,same!.revision);
  expect(reverted?.lifecycle).toMatchObject({allPaidAt:null,expiresAt:2592300000});
});
it("legacy_access_initializes_grace_and_expiry_denies_every_checkpoint",async()=>{
  database.sqlite.prepare("UPDATE bill_retention_policy SET rollout_at=100000").run();
  const legacy=await database.seed(buildBillDocument(draftFixture().draft,1000,"published"));
  const ack=await readEditCheckpoint(legacy.editToken);expect(ack?.lifecycle).toMatchObject({lastActivityAt:1000,expiresAt:2592100000});
  vi.setSystemTime(2592100000);
  await expect(readEditCheckpoint(legacy.editToken)).rejects.toMatchObject({code:"bill-deleting"});
  await expect(readBillByToken("share",legacy.shareToken)).rejects.toMatchObject({code:"bill-deleting"});
});
it("deleted_creation_key_cannot_insert_a_new_active_bill",async()=>{
  const key=createOpaqueToken(),first=await createDraftOnce(key,safeFixture());
  database.sqlite.exec("INSERT INTO bill_deletions (id,share_token_digest,edit_token_digest,deleted_at,reason,state) SELECT id,share_token_digest,edit_token_digest,200000,'manual','deleted' FROM bills; DELETE FROM bills;");
  await expect(createDraftOnce(key,safeFixture())).rejects.toMatchObject({code:"bill-deleted"});
  expect(database.sqlite.prepare("SELECT COUNT(*) AS n FROM bills").get()?.n).toBe(0);
  expect(database.sqlite.prepare("SELECT id FROM bill_deletions").get()?.id).toBe(first.id);
});
it("acknowledges_own_committed_lifecycle_even_after_peer_write",async()=>{
  const first=await createDraftOnce(createOpaqueToken(),safeFixture());vi.setSystemTime(200000);
  database.hooks.afterRun=(sql)=>{
    if(!sql.startsWith("UPDATE bills SET payload_json"))return;
    database.hooks.afterRun=undefined;
    const raw=database.sqlite.prepare("SELECT payload_json FROM bills WHERE id=?").get(first.id)!;
    const peer=JSON.parse(String(raw.payload_json));peer.title="peer";peer.draftForm.draft.title="peer";
    database.sqlite.prepare("UPDATE bills SET payload_json=?,retention_version=retention_version+1,expires_at=2592300000 WHERE id=?").run(JSON.stringify(peer),first.id);
  };
  const mine=safeFixture();mine.draft.title="mine";const result=await saveDraftCheckpoint(first.editToken,first.revision,mine);
  expect(result).toMatchObject({kind:"ok",value:{document:{title:"mine"},lifecycle:{expiresAt:2592200000}}});
  if(result.kind!=="ok")throw new Error("save failed");
  expect(result.value.revision).not.toBe((await readEditCheckpoint(first.editToken))?.revision);
  expect((await saveDraftCheckpoint(first.editToken,result.value.revision,mine)).kind).toBe("conflict");
});
it("request_crossing_expiry_between_load_and_commit_cannot_renew",async()=>{
  const first=await createDraftOnce(createOpaqueToken(),safeFixture());
  const hash=tokens.hashToken;
  vi.spyOn(tokens,"hashToken").mockImplementation(async value=>{if(value.startsWith("{"))vi.setSystemTime(2592100000);return hash(value);});
  const form=safeFixture();form.draft.title="late";
  expect(await saveDraftCheckpoint(first.editToken,first.revision,form)).toMatchObject({kind:"conflict"});
  const stored=database.sqlite.prepare("SELECT payload_json,expires_at FROM bills WHERE id=?").get(first.id)!;
  expect(JSON.parse(String(stored.payload_json)).title).toBe("ทดสอบดราฟต์");expect(stored.expires_at).toBe(2592100000);
});
it("deadline_only_revision_change_rejects_an_old_checkpoint",async()=>{
  const first=await createDraftOnce(createOpaqueToken(),safeFixture());
  database.sqlite.prepare("UPDATE bills SET expires_at=expires_at+1000,retention_version=retention_version+1 WHERE id=?").run(first.id);
  expect(await saveDraftCheckpoint(first.editToken,first.revision,safeFixture())).toMatchObject({kind:"conflict"});
});
it("read_crossing_expiry_rechecks_time_before_projection",async()=>{
  const first=await createDraftOnce(createOpaqueToken(),safeFixture());
  database.hooks.afterFirst=sql=>{if(sql.includes("FROM bills WHERE edit_token_digest")){database.hooks.afterFirst=undefined;vi.setSystemTime(2592100000);}};
  await expect(readEditCheckpoint(first.editToken)).rejects.toMatchObject({code:"bill-deleting"});
});
it("revision_delay_does_not_return_an_expired_payload",async()=>{
  const first=await createDraftOnce(createOpaqueToken(),safeFixture()),hash=tokens.hashToken;
  vi.spyOn(tokens,"hashToken").mockImplementation(async value=>{if(value.startsWith("{"))vi.setSystemTime(2592100000);return hash(value);});
  await expect(readEditCheckpoint(first.editToken)).rejects.toMatchObject({code:"bill-deleting"});
});
it("share_issuance_preserves_qr_marker_and_lifetime",async()=>{
  const first=await createDraftOnce(createOpaqueToken(),safeFixture());
  const raw=database.sqlite.prepare("SELECT payload_json FROM bills WHERE id=?").get(first.id)!;
  const envelope=JSON.parse(String(raw.payload_json));envelope.qrSelectionId="qr-selection";
  envelope.recipient.qr={objectKey:`bills/${first.id}/qr.png`,contentType:"image/png",size:10};envelope.draftForm.draft.recipient.qr=envelope.recipient.qr;
  database.sqlite.prepare("UPDATE bills SET payload_json=? WHERE id=?").run(JSON.stringify(envelope),first.id);
  const loaded=await readEditCheckpoint(first.editToken);vi.setSystemTime(200000);
  const issued=await issueDraftShareCapability(first.editToken,loaded!.revision);
  expect(issued).toMatchObject({kind:"ok",value:{lifecycle:{lastActivityAt:100000,expiresAt:2592100000}}});
  expect((await readEditCheckpoint(first.editToken))?.qrSelectionId).toBe("qr-selection");
});
it("qr_only_confirmation_resets_payment_once_and_same_selection_retries_are_noops",async()=>{
 const {qrBucket}=await import("../helpers/qr-bucket"),{saveQrForEditToken}=await import("../../db/repository");const bucket=qrBucket();worker.env.BUCKET=bucket.bucket;
 const first=await createDraftOnce(createOpaqueToken(),safeFixture()),pub=await publishCheckpoint(first.editToken,first.revision,draftFixture(),"first",first.shareToken);if(pub.kind!=="ok")throw new Error("fixture");vi.setSystemTime(200000);const paid=(await setParticipantPaid(first.editToken,"p1",true,pub.value.revision))!;
 vi.setSystemTime(300000);const file=new File(["qr"],"qr.png",{type:"image/png"}),upload=(await saveQrForEditToken(first.editToken,file,{revision:paid.revision,mode:"confirm",selectionId:"replacement"}))!;
 const edited=await publishCheckpoint(first.editToken,upload.revision,draftFixture(),"qr-only");expect(edited).toMatchObject({kind:"ok",value:{document:{participants:[{paid:false}]},lifecycle:{paymentStatus:"unpaid",allPaidAt:null,expiresAt:2592300000}}});if(edited.kind!=="ok")throw new Error("fixture");
 vi.setSystemTime(400000);const paidAgain=(await setParticipantPaid(first.editToken,"p1",true,edited.value.revision))!;const retry=(await saveQrForEditToken(first.editToken,file,{revision:paidAgain.revision,mode:"confirm",selectionId:"replacement"}))!;expect(retry.revision).toBe(paidAgain.revision);expect(retry.lifecycle).toEqual(paidAgain.lifecycle);expect(bucket.objects.size).toBe(1);
});
