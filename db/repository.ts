import { env } from "cloudflare:workers";
import {
  createOpaqueToken,
  hashToken,
  tokensMatch,
} from "../lib/harn-tee/tokens";
import type {
  BillDocument,
  BillDraft,
  BillPatch,
  BillRecord,
  QrPayment,
} from "../lib/harn-tee/types";
import { applyBillPatch, buildBillDocument } from "./document";
import { draftEnvelope, plainBill, recoverableForm, revisionOf, type BillEnvelope } from "./draft-document";
import { emptyNumbers, normalizeFormNumbers, sanitizeDraftForm, validateFormForPublication, type DraftAck, type DraftForm, type SafeDraftForm, type WriteResult } from "../lib/harn-tee/draft-state";

import {BILL_COLUMNS,rowLifecycle,type StoredBillRow} from "./bill-retention-store";
import {BillUnavailableError,lookupBillAccess} from "./bill-access";
import {advanceLifecycle,paymentProgress,sameDraftActivity,samePublishedContent,type LifecycleSnapshot,type DeleteResult} from "../lib/harn-tee/bill-lifecycle";
import {drainBillQrCleanup,revokeBillSnapshot} from "./bill-deletion";
import {drainQueuedQrAssets,qrAttachmentStatements,queueQrCleanup,registerQrAsset,settleQrAsset} from "./bill-qr-assets";

function database() {
  if (!env.DB) {
    throw new Error("D1 binding DB is unavailable");
  }
  return env.DB;
}

function rowToDocument(row: StoredBillRow): BillDocument {
  return plainBill(JSON.parse(row.payload_json) as BillEnvelope);
}

async function findByToken(kind: "share" | "edit", rawToken: string) {
  const access=await lookupBillAccess({DB:database(),BUCKET:env.BUCKET},kind,rawToken,Date.now());
  if(access.kind==="gone")throw new BillUnavailableError(access.state==="deleted"?"bill-deleted":"bill-deleting");
  if(access.kind==="missing")return null;
  const row=access.row;
  return { row, document: rowToDocument(row), envelope: JSON.parse(row.payload_json) as BillEnvelope };
}

type FoundBill=NonNullable<Awaited<ReturnType<typeof findByToken>>>;
export class BillConflictError extends Error {constructor(public code="revision-conflict"){super(code);}}
export class BillValidationError extends Error {constructor(public errors:string[]){super("invalid-bill");}}
async function conditionalWrite(found:FoundBill,envelope:BillEnvelope,shareDigest=found.row.share_token_digest,draftOnly=false,qrAsset?:{objectKey:string;previousKey?:string}){
  const document=plainBill(envelope),now=Date.now();
  const paidChanged=JSON.stringify(found.document.participants.map(p=>[p.id,p.paid]))!==JSON.stringify(document.participants.map(p=>[p.id,p.paid]));
  const contentChanged=found.document.status==="draft"&&document.status==="draft"
    ?!sameDraftActivity(recoverableForm(found.envelope),recoverableForm(envelope))
    :!samePublishedContent(found.document,document);
  const meaningful=contentChanged||paidChanged||found.document.status!==document.status||JSON.stringify(found.document.recipient.qr)!==JSON.stringify(document.recipient.qr)||found.envelope.qrSelectionId!==envelope.qrSelectionId;
  const lifecycle=advanceLifecycle(rowLifecycle(found.row),found.document,document,now,meaningful),payload=JSON.stringify(envelope);
  const write=database().prepare("UPDATE bills SET payload_json = ?1, updated_at = ?2, share_token_digest = ?3, last_activity_at = ?4, all_paid_at = ?5, expires_at = ?6, retention_version = retention_version + 1 WHERE id = ?7 AND payload_json = ?8 AND share_token_digest = ?9 AND retention_version = ?10 AND expires_at > ?11"+(draftOnly?" AND json_extract(payload_json, '$.status') = 'draft'":"")+(qrAsset?" AND EXISTS (SELECT 1 FROM bill_qr_assets WHERE object_key = ?12 AND put_settled = 1 AND cleanup_requested = 0)":""))
    .bind(payload,envelope.updatedAt,shareDigest,lifecycle.lastActivityAt,lifecycle.allPaidAt,lifecycle.expiresAt,found.row.id,found.row.payload_json,found.row.share_token_digest,found.row.retention_version,now,...(qrAsset?[qrAsset.objectKey]:[]));
  const result=qrAsset?(await database().batch([write,...qrAttachmentStatements({DB:database(),BUCKET:env.BUCKET},{billId:found.row.id,...qrAsset,payloadJson:payload,retentionVersion:found.row.retention_version+1})]))[0]:await write.run();
  if(result.meta.changes!==1)return null;
  const row:StoredBillRow={...found.row,payload_json:payload,updated_at:envelope.updatedAt,share_token_digest:shareDigest,last_activity_at:lifecycle.lastActivityAt,all_paid_at:lifecycle.allPaidAt,expires_at:lifecycle.expiresAt,retention_version:found.row.retention_version+1};
  return {row,document,envelope};
}
async function acknowledgement(found:FoundBill):Promise<DraftAck>{
  const revision=await revisionOf(found.row.payload_json,found.row.share_token_digest,found.row.retention_version),lifecycle=rowLifecycle(found.row),serverNow=Date.now();
  if(lifecycle.expiresAt<=serverNow)throw new BillUnavailableError("bill-deleting");
  return {id:found.row.id,document:found.document,revision,lifecycle:{...lifecycle,...paymentProgress(found.document)},serverNow,...(found.document.status==="draft"?{form:recoverableForm(found.envelope)}:{}),...(found.envelope.lastConfirmationId?{lastConfirmationId:found.envelope.lastConfirmationId}:{}),...(found.envelope.qrSelectionId?{qrSelectionId:found.envelope.qrSelectionId}:{})};
}
async function checkDraft(editToken:string,revision:string):Promise<FoundBill|WriteResult<never>>{
  const found=await findByToken("edit",editToken);
  if(!found||found.document.status==="deleted")return {kind:"not-found"};
  if(found.document.status!=="draft")return {kind:"conflict",code:"not-draft"};
  if(await revisionOf(found.row.payload_json,found.row.share_token_digest,found.row.retention_version??0)!==revision)return {kind:"conflict",code:"revision-conflict"};
  return found;
}
export async function readEditCheckpoint(editToken:string):Promise<DraftAck|null>{
  const found=await findByToken("edit",editToken);return !found||found.document.status==="deleted"?null:acknowledgement(found);
}
export async function createDraftOnce(creationKey:string,form:SafeDraftForm){
  const editToken=await hashToken("harn-tee:draft-edit:v1:"+creationKey),shareToken=await hashToken("harn-tee:draft-share:v1:"+creationKey);
  const envelope=draftEnvelope(form),id=crypto.randomUUID();
  const lifecycle=advanceLifecycle(null,null,envelope,envelope.createdAt,true);
  await database().prepare("INSERT OR IGNORE INTO bills (id, share_token_digest, edit_token_digest, payload_json, created_at, updated_at, last_activity_at, all_paid_at, expires_at) SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9 WHERE NOT EXISTS (SELECT 1 FROM bill_deletions WHERE edit_token_digest = ?3)")
    .bind(id,await hashToken(shareToken),await hashToken(editToken),JSON.stringify(envelope),envelope.createdAt,envelope.updatedAt,lifecycle.lastActivityAt,lifecycle.allPaidAt,lifecycle.expiresAt).run();
  const found=await findByToken("edit",editToken);if(!found)throw new Error("draft-create-failed");
  return {...await acknowledgement(found),editToken,...(await tokensMatch(shareToken,found.row.share_token_digest)?{shareToken}:{})};
}
export async function saveDraftCheckpoint(editToken:string,revision:string,form:SafeDraftForm):Promise<WriteResult<DraftAck>>{
  const found=await checkDraft(editToken,revision);if("kind" in found)return found;
  const envelope={...draftEnvelope(form,found.document),...(found.envelope.qrSelectionId?{qrSelectionId:found.envelope.qrSelectionId}:{})};
  const committed=await conditionalWrite(found,envelope,undefined,true);
  if(!committed)return {kind:"conflict",code:"revision-conflict"};
  return {kind:"ok",value:await acknowledgement(committed)};
}
export async function issueDraftShareCapability(editToken:string,revision:string):Promise<WriteResult<{shareToken:string;revision:string;lifecycle:LifecycleSnapshot;serverNow:number}>>{
  const found=await checkDraft(editToken,revision);if("kind" in found)return found;
  const shareToken=createOpaqueToken(),shareDigest=await hashToken(shareToken),envelope={...draftEnvelope(recoverableForm(found.envelope),found.document),...(found.envelope.qrSelectionId?{qrSelectionId:found.envelope.qrSelectionId}:{})};
  const committed=await conditionalWrite(found,envelope,shareDigest,true);
  if(!committed)return {kind:"conflict",code:"revision-conflict"};
  const ack=await acknowledgement(committed);
  return {kind:"ok",value:{shareToken,revision:ack.revision,lifecycle:ack.lifecycle,serverNow:ack.serverNow}};
}
export async function publishCheckpoint(editToken:string,revision:string,form:DraftForm,confirmationId:string,shareToken?:string):Promise<WriteResult<DraftAck>>{
  const found=await findByToken("edit",editToken);if(!found||found.document.status==="deleted")return {kind:"not-found"};
  if(found.document.status==="published"&&found.envelope.lastConfirmationId===confirmationId)return {kind:"ok",value:await acknowledgement(found)};
  if(await revisionOf(found.row.payload_json,found.row.share_token_digest,found.row.retention_version??0)!==revision)return {kind:"conflict",code:"revision-conflict"};
  if(found.document.status==="draft"&&(!shareToken||!await tokensMatch(shareToken,found.row.share_token_digest)))return {kind:"conflict",code:"share-proof-stale"};
  const normalized=normalizeFormNumbers(form);
  normalized.draft={...normalized.draft,recipient:{name:"",bank:null,promptPay:null,visible:true,...normalized.draft.recipient,qr:found.document.recipient.qr}};
  const validity=validateFormForPublication(normalized);if(!validity.valid)throw new BillValidationError(validity.errors);
  const patch:BillPatch={...normalized.draft,participants:normalized.draft.participants.map(p=>({...p,paid:false,paidAt:null})),status:"published"};
  const candidate=applyBillPatch(found.document,patch);
  const envelope:BillEnvelope={...(found.document.status==="published"&&samePublishedContent(found.document,candidate)?found.envelope:candidate),lastConfirmationId:confirmationId};
  const committed=await conditionalWrite(found,envelope,undefined,found.document.status==="draft");
  if(!committed)return {kind:"conflict",code:"revision-conflict"};
  return {kind:"ok",value:await acknowledgement(committed)};
}

export async function createBillRecord(
  draft: BillDraft,
  status: "draft" | "published" = "draft",
) {
  const id = crypto.randomUUID();
  const shareToken = createOpaqueToken();
  const editToken = createOpaqueToken();
  const document = buildBillDocument(status==="draft"?sanitizeDraftForm({draft,step:0,numbers:emptyNumbers()}).draft:draft, Date.now(), status);
  const lifecycle=advanceLifecycle(null,null,document,document.createdAt,true);

  await database()
    .prepare(
      "INSERT INTO bills (id, share_token_digest, edit_token_digest, payload_json, created_at, updated_at, last_activity_at, all_paid_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
    )
    .bind(
      id,
      await hashToken(shareToken),
      await hashToken(editToken),
      JSON.stringify(document),
      document.createdAt,
      document.updatedAt,
      lifecycle.lastActivityAt,lifecycle.allPaidAt,lifecycle.expiresAt,
    )
    .run();

  return { id, shareToken, editToken, document };
}

export async function readBillByToken(
  kind: "share" | "edit",
  rawToken: string,
): Promise<BillRecord | null> {
  const found = await findByToken(kind, rawToken);
  if (
    !found ||
    found.document.status === "deleted" ||
    (kind === "share" && found.document.status !== "published")
  ) return null;
  const ack=await acknowledgement(found);
  return {
    id: found.row.id,
    document: found.document,
    access: kind,
    revision:ack.revision,lifecycle:ack.lifecycle,serverNow:ack.serverNow,
  };
}

export async function updateBillByEditToken(
  rawToken: string,
  patch: BillPatch,
) {
  const found = await findByToken("edit", rawToken);
  if (!found || found.document.status === "deleted") return null;
  let document = applyBillPatch(found.document, patch);
  if(found.document.status==="published"&&samePublishedContent(found.document,document))document={...document,participants:found.document.participants};
  if(document.status==="draft")document={...document,recipient:sanitizeDraftForm({draft:document,step:0,numbers:emptyNumbers()}).draft.recipient!};
  const committed=await conditionalWrite(found,document,undefined,found.document.status==="draft");
  if(!committed)throw new BillConflictError();
  return committed.document;
}

export function setParticipantPaid(rawToken:string,participantId:string,paid:boolean):Promise<BillDocument|null>;
export function setParticipantPaid(rawToken:string,participantId:string,paid:boolean,revision:string):Promise<DraftAck|null>;
export async function setParticipantPaid(
  rawToken: string,
  participantId: string,
  paid: boolean,
  revision?:string,
):Promise<BillDocument|DraftAck|null> {
  let found=await findByToken(revision?"edit":"share",rawToken);
  if(!found||found.document.status!=="published")found=await findByToken("edit",rawToken);
  if(!found||found.document.status!=="published")return null;
  if(revision&&await revisionOf(found.row.payload_json,found.row.share_token_digest,found.row.retention_version??0)!==revision)throw new BillConflictError();
  const participant=found.document.participants.find(person=>person.id===participantId);
  if(!participant)throw new BillValidationError(["ไม่พบผู้ร่วมจ่ายในบิลนี้"]);
  if(participant.paid===paid)return revision?acknowledgement(found):found.document;
  const document: BillDocument = {
    ...found.document,
    participants: found.document.participants.map((person) =>
      person.id === participantId
        ? { ...person, paid, paidAt: paid ? Date.now() : null }
        : person,
    ),
    updatedAt: Date.now(),
  };

  const envelope={...document,...(found.envelope.lastConfirmationId?{lastConfirmationId:found.envelope.lastConfirmationId}:{})};
  const committed=await conditionalWrite(found,envelope);
  if(!committed)throw new BillConflictError();
  return revision?acknowledgement(committed):committed.document;
}

export async function deleteBillByEditToken(rawToken:string,revision:string):Promise<DeleteResult|null>{
  const bindings={DB:database(),BUCKET:env.BUCKET},digest=await hashToken(rawToken);
  const access=await lookupBillAccess(bindings,"edit",rawToken,Date.now());
  if(access.kind==="missing")return null;
  if(access.kind==="gone"){
    const marker=await database().prepare("SELECT id FROM bill_deletions WHERE edit_token_digest = ?1").bind(digest).first<{id:string}>();
    if(marker)return {state:await drainBillQrCleanup(bindings,marker.id,Date.now(),20),serverNow:Date.now()};
  }
  const row=access.kind==="active"?access.row:await database().prepare("SELECT "+BILL_COLUMNS+" FROM bills WHERE edit_token_digest = ?1").bind(digest).first<StoredBillRow>();
  if(!row)throw new BillConflictError();
  const currentRevision=await revisionOf(row.payload_json,row.share_token_digest,row.retention_version),now=Date.now(),reason=rowLifecycle(row).expiresAt<=now?"expired":"manual";
  if(reason==="manual"&&currentRevision!==revision)throw new BillConflictError();
  if(await revokeBillSnapshot(bindings,row,reason,now)!=="revoked")throw new BillConflictError();
  return {state:await drainBillQrCleanup(bindings,row.id,now,20),serverNow:Date.now()};
}

type QrSaveOptions={revision:string;mode:"draft"|"confirm";selectionId?:string};
export function saveQrForEditToken(rawToken:string,file:File):Promise<BillDocument|null>;
export function saveQrForEditToken(rawToken:string,file:File,options:QrSaveOptions):Promise<DraftAck|null>;
export async function saveQrForEditToken(
  rawToken: string,
  file: File,
  options?:QrSaveOptions,
): Promise<BillDocument | DraftAck | null> {
  const found = await findByToken("edit", rawToken);
  if (!found || found.document.status === "deleted" || !env.BUCKET) return null;
  if(options?.mode==="draft"&&found.document.status!=="draft")throw new BillConflictError("not-draft");
  if(options&&await revisionOf(found.row.payload_json,found.row.share_token_digest,found.row.retention_version??0)!==options.revision)throw new BillConflictError();
  if(options?.selectionId&&found.envelope.qrSelectionId===options.selectionId&&found.document.recipient.qr)return acknowledgement(found);

  const extension = file.type.split("/")[1] ?? "png";
  const objectKey = "bills/" + found.row.id + "/" + crypto.randomUUID() + "." + extension;
  const bindings={DB:database(),BUCKET:env.BUCKET};
  if(!await registerQrAsset(bindings,found.row,objectKey,options?.selectionId,Date.now()))throw new BillConflictError();
  try{
    await env.BUCKET.put(objectKey,await file.arrayBuffer(),{httpMetadata:{contentType:file.type}});
    await settleQrAsset(bindings,objectKey,"stored",Date.now());
  }catch(error){
    await settleQrAsset(bindings,objectKey,"uncertain",Date.now());await queueQrCleanup(bindings,objectKey,Date.now());throw error;
  }

  const previousKey = found.document.recipient.qr?.objectKey;

  const qr: QrPayment = {
    objectKey,
    contentType: file.type,
    size: file.size,
  };
  const document: BillDocument = {
    ...found.document,
    recipient: { ...found.document.recipient, qr },
    updatedAt: Date.now(),
  };

  const envelope:BillEnvelope={...(found.document.status==="draft"?draftEnvelope(recoverableForm(found.envelope),document):{...document,...(found.envelope.lastConfirmationId?{lastConfirmationId:found.envelope.lastConfirmationId}:{})}),...(options?.selectionId?{qrSelectionId:options.selectionId}:{})};
  const committed=await conditionalWrite(found,envelope,undefined,found.document.status==="draft",{objectKey,previousKey});
  if(!committed){
    await queueQrCleanup(bindings,objectKey,Date.now());await drainQueuedQrAssets(bindings,Date.now(),1,found.row.id);throw new BillConflictError();
  }
  if(previousKey)await drainQueuedQrAssets(bindings,Date.now(),1,found.row.id);
  return options?acknowledgement(committed):committed.document;
}

export async function readQrByToken(rawToken: string) {
  const access = await readBillByToken("share", rawToken);
  const editAccess = access ?? (await readBillByToken("edit", rawToken));
  if (!editAccess || !env.BUCKET) return null;
  if (editAccess.access === "share" && editAccess.document.recipient.visible === false) {
    return null;
  }
  const objectKey = editAccess.document.recipient.qr?.objectKey;
  if (!objectKey) return null;
  return env.BUCKET.get(objectKey);
}
