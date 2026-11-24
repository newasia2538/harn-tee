import {calculateBill} from "./money";
import {formFromDocument,sanitizeDraftForm,type SafeDraftForm} from "./draft-state";
import {selectLiveTotals} from "./live-totals";
import type {BillDocument} from "./types";

export type BillPaymentStatus="draft"|"unpaid"|"partial"|"paid";
export type BillLifecycle={lastActivityAt:number;allPaidAt:number|null;expiresAt:number};
export type LifecycleSnapshot=BillLifecycle & {paymentStatus:BillPaymentStatus;paidCount:number;payerCount:number};
export type BillSummary={id:string;title:string;totalSatang:number;lifecycle:LifecycleSnapshot;revision:string};
export type DeleteResult={state:"deleting"|"deleted";serverNow:number};
export const NORMAL_LIFETIME_MS=2_592_000_000;
export const PAID_LIFETIME_MS=604_800_000;

export function paymentProgress(document:BillDocument):Pick<LifecycleSnapshot,"paymentStatus"|"paidCount"|"payerCount">{
  const relevant=new Set(calculateBill(document).participants.filter(p=>p.amountDueSatang>0).map(p=>p.participantId));
  const payerCount=relevant.size,paidCount=document.participants.filter(p=>relevant.has(p.id)&&p.paid).length;
  const paymentStatus:BillPaymentStatus=document.status!=="published"?"draft":payerCount>0&&paidCount===payerCount?"paid":paidCount>0?"partial":"unpaid";
  return {paymentStatus,paidCount,payerCount};
}

export function advanceLifecycle(previous:BillLifecycle|null,before:BillDocument|null,after:BillDocument,now:number,meaningful:boolean):BillLifecycle{
  if(previous&&!meaningful)return {...previous};
  const complete=paymentProgress(after).paymentStatus==="paid";
  if(complete&&previous&&before&&paymentProgress(before).paymentStatus==="paid"&&previous.allPaidAt!==null){
    return {...previous,lastActivityAt:now};
  }
  return {lastActivityAt:now,allPaidAt:complete?now:null,expiresAt:now+(complete?PAID_LIFETIME_MS:NORMAL_LIFETIME_MS)};
}

function publishedContent(document:BillDocument){
  const recipient=document.recipient;
  return {
    title:document.title.trim(),feeMode:document.feeMode??"bill",calculationMode:document.calculationMode??"vat-after-service",
    participants:document.participants.map(p=>({id:p.id,name:p.name.trim(),order:p.order})),
    items:document.items.map(i=>({id:i.id,name:i.name.trim(),priceSatang:i.priceSatang,payerIds:[...i.payerIds].sort(),vatPercent:i.vatPercent??0,serviceChargePercent:i.serviceChargePercent??0,order:i.order})),
    vatPercent:document.vatPercent,serviceChargePercent:document.serviceChargePercent,
    recipient:{name:recipient.name.trim(),bank:recipient.bank?{bankId:recipient.bank.bankId,accountNumber:recipient.bank.accountNumber}:null,promptPay:recipient.promptPay?{type:recipient.promptPay.type,value:recipient.promptPay.value}:null,qr:recipient.qr?{objectKey:recipient.qr.objectKey,contentType:recipient.qr.contentType,size:recipient.qr.size}:null,visible:recipient.visible!==false},
  };
}

/** Ephemeral comparisons only; never persist a content/payment fingerprint. */
export function samePublishedContent(current:BillDocument,candidate:BillDocument):boolean{
  return JSON.stringify(publishedContent(current))===JSON.stringify(publishedContent(candidate));
}

function ordered(value:unknown):unknown{
  if(Array.isArray(value))return value.map(ordered);
  if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,ordered(item)]));
  return value;
}
export function sameDraftActivity(before:SafeDraftForm,after:SafeDraftForm):boolean{
  const activity=(input:SafeDraftForm)=>{
    const safe=sanitizeDraftForm(input);
    return JSON.stringify(ordered({draft:safe.draft,numbers:safe.numbers}));
  };
  return activity(before)===activity(after);
}

export function summarizeBill(document:BillDocument,id:string,revision:string,lifecycle:BillLifecycle):BillSummary{
  const calculation=document.status==="draft"?selectLiveTotals(formFromDocument(document)).calculation:calculateBill(document);
  return {id,title:document.title,totalSatang:calculation.grossTotalSatang,lifecycle:{...lifecycle,...paymentProgress(document)},revision};
}
