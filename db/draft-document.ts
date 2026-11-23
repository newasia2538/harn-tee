import { hashToken } from "../lib/harn-tee/tokens";
import { formFromDocument, sanitizeDraftForm, type DraftForm, type SafeDraftForm } from "../lib/harn-tee/draft-state";
import type { BillDocument } from "../lib/harn-tee/types";
import { buildBillDocument } from "./document";

export type BillEnvelope=BillDocument & {draftForm?:SafeDraftForm;lastConfirmationId?:string};
export const revisionOf=(payload:string,shareDigest:string)=>hashToken(payload+"\0"+shareDigest);
export function plainBill(input:BillEnvelope):BillDocument {
  const {version,status,title,feeMode,calculationMode,participants,items,vatPercent,serviceChargePercent,recipient,createdAt,updatedAt}=input;
  const result={version,status,title,feeMode,calculationMode,participants,items,vatPercent,serviceChargePercent,recipient,createdAt,updatedAt};
  if(status==="draft")result.recipient=sanitizeDraftForm(formFromDocument(result)).draft.recipient!;
  return result;
}
export function recoverableForm(document:BillEnvelope):SafeDraftForm {
  return sanitizeDraftForm(document.draftForm??formFromDocument(plainBill(document)));
}
export function draftEnvelope(form:DraftForm,current?:BillDocument):BillEnvelope {
  const safe=sanitizeDraftForm(form);
  safe.draft.recipient={...safe.draft.recipient!,qr:current?.recipient.qr??null};
  const document=buildBillDocument(safe.draft,Date.now(),"draft");
  return {...document,createdAt:current?.createdAt??document.createdAt,draftForm:safe};
}
