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

import {BILL_COLUMNS,type StoredBillRow} from "./bill-retention-store";
import {advanceLifecycle} from "../lib/harn-tee/bill-lifecycle";

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
  const digest = await hashToken(rawToken);
  const column =
    kind === "share" ? "share_token_digest" : "edit_token_digest";
  const row = await database()
    .prepare(
      "SELECT "+BILL_COLUMNS+" FROM bills WHERE " +
        column +
        " = ?1 LIMIT 1",
    )
    .bind(digest)
    .first<StoredBillRow>();

  if (!row || !(await tokensMatch(rawToken, row[column]))) return null;
  return { row, document: rowToDocument(row), envelope: JSON.parse(row.payload_json) as BillEnvelope };
}

type FoundBill=NonNullable<Awaited<ReturnType<typeof findByToken>>>;
export class BillConflictError extends Error {constructor(public code="revision-conflict"){super(code);}}
export class BillValidationError extends Error {constructor(public errors:string[]){super("invalid-bill");}}
async function conditionalWrite(found:FoundBill,envelope:BillEnvelope,shareDigest=found.row.share_token_digest,draftOnly=false){
  const result=await database().prepare("UPDATE bills SET payload_json = ?1, updated_at = ?2, share_token_digest = ?3 WHERE id = ?4 AND payload_json = ?5 AND share_token_digest = ?6"+(draftOnly?" AND json_extract(payload_json, '$.status') = 'draft'":""))
    .bind(JSON.stringify(envelope),envelope.updatedAt,shareDigest,found.row.id,found.row.payload_json,found.row.share_token_digest).run();
  return result.meta.changes===1;
}
async function acknowledgement(found:FoundBill):Promise<DraftAck>{
  return {id:found.row.id,document:found.document,revision:await revisionOf(found.row.payload_json,found.row.share_token_digest,found.row.retention_version??0),...(found.document.status==="draft"?{form:recoverableForm(found.envelope)}:{}),...(found.envelope.lastConfirmationId?{lastConfirmationId:found.envelope.lastConfirmationId}:{}),...(found.envelope.qrSelectionId?{qrSelectionId:found.envelope.qrSelectionId}:{})};
}
function committedBill(found:FoundBill,envelope:BillEnvelope,shareDigest=found.row.share_token_digest):FoundBill{
  return {row:{...found.row,payload_json:JSON.stringify(envelope),updated_at:envelope.updatedAt,share_token_digest:shareDigest},document:plainBill(envelope),envelope};
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
  await database().prepare("INSERT OR IGNORE INTO bills (id, share_token_digest, edit_token_digest, payload_json, created_at, updated_at, last_activity_at, all_paid_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)")
    .bind(id,await hashToken(shareToken),await hashToken(editToken),JSON.stringify(envelope),envelope.createdAt,envelope.updatedAt,lifecycle.lastActivityAt,lifecycle.allPaidAt,lifecycle.expiresAt).run();
  const found=await findByToken("edit",editToken);if(!found)throw new Error("draft-create-failed");
  return {...await acknowledgement(found),editToken,...(await tokensMatch(shareToken,found.row.share_token_digest)?{shareToken}:{})};
}
export async function saveDraftCheckpoint(editToken:string,revision:string,form:SafeDraftForm):Promise<WriteResult<DraftAck>>{
  const found=await checkDraft(editToken,revision);if("kind" in found)return found;
  const envelope={...draftEnvelope(form,found.document),...(found.envelope.qrSelectionId?{qrSelectionId:found.envelope.qrSelectionId}:{})};
  if(!await conditionalWrite(found,envelope,undefined,true))return {kind:"conflict",code:"revision-conflict"};
  return {kind:"ok",value:await acknowledgement(committedBill(found,envelope))};
}
export async function issueDraftShareCapability(editToken:string,revision:string):Promise<WriteResult<{shareToken:string;revision:string}>>{
  const found=await checkDraft(editToken,revision);if("kind" in found)return found;
  const shareToken=createOpaqueToken(),shareDigest=await hashToken(shareToken),envelope=draftEnvelope(recoverableForm(found.envelope),found.document);
  if(!await conditionalWrite(found,envelope,shareDigest,true))return {kind:"conflict",code:"revision-conflict"};
  return {kind:"ok",value:{shareToken,revision:await revisionOf(JSON.stringify(envelope),shareDigest,found.row.retention_version??0)}};
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
  const envelope:BillEnvelope={...applyBillPatch(found.document,patch),lastConfirmationId:confirmationId};
  if(!await conditionalWrite(found,envelope,undefined,found.document.status==="draft"))return {kind:"conflict",code:"revision-conflict"};
  return {kind:"ok",value:await acknowledgement(committedBill(found,envelope))};
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
  return {
    id: found.row.id,
    document: found.document,
    access: kind,
  };
}

export async function updateBillByEditToken(
  rawToken: string,
  patch: BillPatch,
) {
  const found = await findByToken("edit", rawToken);
  if (!found || found.document.status === "deleted") return null;
  let document = applyBillPatch(found.document, patch);
  if(document.status==="draft")document={...document,recipient:sanitizeDraftForm({draft:document,step:0,numbers:emptyNumbers()}).draft.recipient!};
  if(!await conditionalWrite(found,document,undefined,found.document.status==="draft"))throw new BillConflictError();

  return document;
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
  if(!await conditionalWrite(found,envelope))throw new BillConflictError();
  return revision?acknowledgement(committedBill(found,envelope)):document;
}

export async function deleteBillByEditToken(rawToken: string) {
  const found = await findByToken("edit", rawToken);
  if (!found) return false;
  const qrObjectKey = found.document.recipient.qr?.objectKey;
  if (qrObjectKey) {
    if (!env.BUCKET) throw new Error("R2 binding BUCKET is unavailable");
    await env.BUCKET.delete(qrObjectKey);
  }
  await database()
    .prepare("DELETE FROM bills WHERE id = ?1")
    .bind(found.row.id)
    .run();
  return true;
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

  const extension = file.type.split("/")[1] ?? "png";
  const objectKey = "bills/" + found.row.id + "/" + crypto.randomUUID() + "." + extension;
  await env.BUCKET.put(objectKey, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });

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
  if(!await conditionalWrite(found,envelope,undefined,found.document.status==="draft")){
    await env.BUCKET.delete(objectKey).catch(()=>undefined);throw new BillConflictError();
  }
  if(previousKey)await env.BUCKET.delete(previousKey).catch(()=>{console.warn("qr-cleanup-failed");});
  return options?acknowledgement(committedBill(found,envelope)):plainBill(envelope);
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
