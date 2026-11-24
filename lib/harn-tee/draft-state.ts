import { z } from "zod";
import { billCreateBodySchema } from "./server-validation";
import { calculateBill } from "./money";
import { validateBillDraft, validateRecipient } from "./validation";
import type { BillDocument, BillDraft, RecipientData, ValidationResult } from "./types";
import type {LifecycleSnapshot} from "./bill-lifecycle";

export type NumericInputs = {prices: Record<string,string>; itemVat: Record<string,string>; itemService: Record<string,string>; vat: string; service: string};
export type NumericField = {kind:"price"|"item-vat"|"item-service";itemId:string}|{kind:"vat"|"service"};
export type DraftForm = {draft:BillDraft;step:0|1|2;numbers:NumericInputs};
export type SafeDraftForm = DraftForm & {paymentReentryRequired:boolean};
export type RemoteIdentity = {id:string;editToken:string;shareToken?:string;revision:string;serverVersion?:number;status:"draft"|"published";lifecycle?:LifecycleSnapshot;qrSelectionId?:string};
export type DraftAck = {id:string;document:BillDocument;form?:SafeDraftForm;revision:string;serverVersion?:number;lifecycle:LifecycleSnapshot;serverNow:number;lastConfirmationId?:string;qrSelectionId?:string};
export type QrSelection = {kind:"none"}|{kind:"server"}|{kind:"local";selectionId:string;file:File};
export type StoredQrSelection = {kind:"none"}|{kind:"server"}|{kind:"local";selectionId:string;name:string;contentType:"image/png"|"image/jpeg"|"image/webp";size:number};
type CheckpointMetadata={provenance?:"created-here"|"edit-only";lifecycle?:LifecycleSnapshot};
export type WorkingCheckpoint = CheckpointMetadata & {kind:"working";schemaVersion:1;localId:string;localVersion:number;formSequence:number;form:SafeDraftForm;remote?:RemoteIdentity;creationKey?:string;pendingConfirmation?:{id:string;formSequence:number};qr:StoredQrSelection;savedAt:number;serverSavedAt?:number};
export type CompletionCheckpoint = CheckpointMetadata & {kind:"complete";schemaVersion:1;localId:string;localVersion:number;billId:string;shareUrl:string;editUrl:string;revision?:string;serverVersion?:number;savedAt:number};
export type Checkpoint = WorkingCheckpoint | CompletionCheckpoint;
export type DraftContext = {kind:"new"}|{kind:"edit";editToken:string}|{kind:"local";localId:string};
export type WriteResult<T> = {kind:"ok";value:T}|{kind:"not-found"}|{kind:"conflict";code?:"revision-conflict"|"not-draft"|"share-proof-stale"};
export type SaveState = {status:"idle"|"pending"|"saving"|"saved"|"error"|"conflict";savedAt?:number;code?:string};

const mapSchema = z.record(z.string().min(1).max(80), z.string().max(32));
export const numbersSchema=z.object({prices:mapSchema,itemVat:mapSchema,itemService:mapSchema,vat:z.string().max(32),service:z.string().max(32)}).strict();
export const formInputSchema=z.object({draft:billCreateBodySchema.omit({draft:true}),step:z.union([z.literal(0),z.literal(1),z.literal(2)]),numbers:numbersSchema}).strict();
export const persistedFormSchema=formInputSchema.extend({paymentReentryRequired:z.boolean()}).superRefine((form,ctx)=>{
  const pp=form.draft.recipient?.promptPay;
  if(pp && (pp.type==="national-id" ? pp.value!=="" : !/^\d{0,10}$/.test(pp.value))) ctx.addIssue({code:"custom",message:"Unsafe stored payment value"});
  const ids=new Set(form.draft.items.map(x=>x.id));
  if([form.numbers.prices,form.numbers.itemVat,form.numbers.itemService].some(map=>Object.keys(map).some(id=>!ids.has(id)))) ctx.addIssue({code:"custom",message:"Unknown item input"});
});

const key=z.string().min(1).max(200), counter=z.number().int().nonnegative();
const lifecycleSchema=z.object({lastActivityAt:counter,allPaidAt:counter.nullable(),expiresAt:counter,paymentStatus:z.enum(["draft","unpaid","partial","paid"]),paidCount:counter,payerCount:counter}).strict();
const remoteSchema=z.object({id:key,editToken:key,shareToken:key.optional(),revision:key,serverVersion:counter.optional(),status:z.enum(["draft","published"]),lifecycle:lifecycleSchema.optional(),qrSelectionId:key.optional()}).strict();
const storedQrSchema=z.discriminatedUnion("kind",[
  z.object({kind:z.literal("none")}).strict(),z.object({kind:z.literal("server")}).strict(),
  z.object({kind:z.literal("local"),selectionId:key,name:z.string().max(255),contentType:z.enum(["image/png","image/jpeg","image/webp"]),size:counter.max(5*1024*1024)}).strict(),
]);

const checkpointBase={provenance:z.enum(["created-here","edit-only"]).optional(),lifecycle:lifecycleSchema.optional(),schemaVersion:z.literal(1),localId:key,localVersion:counter,savedAt:counter};
const workingSchema=z.object({...checkpointBase,kind:z.literal("working"),formSequence:counter,form:persistedFormSchema,remote:remoteSchema.optional(),creationKey:key.optional(),pendingConfirmation:z.object({id:key,formSequence:counter}).strict().optional(),qr:storedQrSchema,serverSavedAt:counter.optional()}).strict();
const completionSchema=z.object({...checkpointBase,kind:z.literal("complete"),billId:key,revision:key.optional(),serverVersion:counter.optional(),shareUrl:z.string().url().regex(/^https?:\/\//),editUrl:z.string().url().regex(/^https?:\/\//)}).strict();

export function parseStoredCheckpoint(value:unknown):Checkpoint {
  return z.discriminatedUnion("kind",[workingSchema,completionSchema]).parse(value);
}

export function emptyNumbers():NumericInputs {return {prices:{},itemVat:{},itemService:{},vat:"",service:""};}
export function makeBlankForm():DraftForm {
  const person=crypto.randomUUID();
  return {draft:{title:"",feeMode:"bill",calculationMode:"vat-after-service",participants:[{id:person,name:"",order:0}],items:[{id:crypto.randomUUID(),name:"",priceSatang:0,payerIds:[person],order:0}],vatPercent:0,serviceChargePercent:0,recipient:{name:"",bank:null,promptPay:null,qr:null,visible:true}},step:0,numbers:emptyNumbers()};
}
export function formFromDocument(document:BillDocument):DraftForm {
  const numbers=emptyNumbers();numbers.vat=document.vatPercent?String(document.vatPercent):"";numbers.service=document.serviceChargePercent?String(document.serviceChargePercent):"";
  return {draft:{title:document.title,feeMode:document.feeMode??"bill",calculationMode:document.calculationMode??"vat-after-service",participants:document.participants.map(({id,name,order})=>({id,name,order})),items:document.items,vatPercent:document.vatPercent,serviceChargePercent:document.serviceChargePercent,recipient:document.recipient},step:0,numbers};
}
export function parseNumericInput(raw:string,kind:"price"|"percent") {
  const text=raw.trim();
  if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(text)) return {value:null,complete:false};
  const [whole,fraction=""]=text.replace(/,/g,"").split(".");
  const value=kind==="price" ? Number(whole)*100+Number(fraction.padEnd(2,"0")) : Number(text.replace(/,/g,""));
  if(!Number.isFinite(value)||value<0||(kind==="price"?!Number.isSafeInteger(value):value>100))return {value:null,complete:false};
  return {value,complete:true};
}
export function setNumericInput(form:DraftForm,field:NumericField,raw:string):DraftForm {
  const price=field.kind==="price", value=parseNumericInput(raw,price?"price":"percent").value??0;
  if(!("itemId" in field)) return {...form,numbers:{...form.numbers,[field.kind]:raw},draft:{...form.draft,[field.kind==="vat"?"vatPercent":"serviceChargePercent"]:value}};
  const map=field.kind==="price"?"prices":field.kind==="item-vat"?"itemVat":"itemService";
  const prop=field.kind==="price"?"priceSatang":field.kind==="item-vat"?"vatPercent":"serviceChargePercent";
  return {...form,numbers:{...form.numbers,[map]:{...form.numbers[map],[field.itemId]:raw}},draft:{...form.draft,items:form.draft.items.map(item=>item.id===field.itemId?{...item,[prop]:value}:item)}};
}
export function normalizeFormNumbers(form:DraftForm):DraftForm {
  let result=form;
  for(const kind of ["vat","service"] as const) if(form.numbers[kind]!=="") result=setNumericInput(result,{kind},form.numbers[kind]);
  for(const item of form.draft.items) for(const [kind,map] of [["price","prices"],["item-vat","itemVat"],["item-service","itemService"]] as const) {
    const raw=form.numbers[map][item.id]; if(raw!==undefined)result=setNumericInput(result,{kind,itemId:item.id},raw);
  }
  return result;
}
export function invalidNumberFields(form:DraftForm):string[] {
  const invalid:string[]=[];
  for(const kind of ["vat","service"] as const)if(form.numbers[kind]!==""&&!parseNumericInput(form.numbers[kind],"percent").complete)invalid.push(kind);
  for(const item of form.draft.items)for(const [kind,map] of [["price","prices"],["item-vat","itemVat"],["item-service","itemService"]] as const){
    if(kind!=="price"&&form.draft.feeMode!=="item")continue;
    const raw=form.numbers[map][item.id];
    if(raw!==undefined&&!(kind!=="price"&&raw==="")&&!parseNumericInput(raw,kind==="price"?"price":"percent").complete)invalid.push(`${kind}:${item.id}`);
  }
  return invalid;
}
const safeAmount=(n:number)=>Number.isSafeInteger(n)&&n>=0?n:0;
const safePercent=(n:number|undefined)=>typeof n==="number"&&Number.isFinite(n)&&n>=0&&n<=100?n:0;
export function sanitizeDraftForm(input:DraftForm):SafeDraftForm {
  const form=normalizeFormNumbers(input), draft=form.draft, pp=draft.recipient?.promptPay;
  const omitted=Boolean(pp&&(pp.type==="national-id"||!/^\d{0,10}$/.test(pp.value)));
  const ids=new Set(draft.items.map(x=>x.id));
  const cleanMap=(map:Record<string,string>)=>Object.fromEntries(Object.entries(map).filter(([id])=>ids.has(id)));
  const recipient=draft.recipient;
  const result={draft:{title:draft.title,feeMode:draft.feeMode,calculationMode:draft.calculationMode,participants:draft.participants.map(({id,name,order})=>({id,name,order})),items:draft.items.map(({id,name,priceSatang,payerIds,vatPercent,serviceChargePercent,order})=>({id,name,priceSatang:safeAmount(priceSatang),payerIds:[...payerIds],vatPercent:safePercent(vatPercent),serviceChargePercent:safePercent(serviceChargePercent),order})),vatPercent:safePercent(draft.vatPercent),serviceChargePercent:safePercent(draft.serviceChargePercent),recipient:recipient?{name:recipient.name,bank:recipient.bank?{bankId:recipient.bank.bankId,accountNumber:recipient.bank.accountNumber}:null,promptPay:pp?{type:pp.type,value:omitted?"":pp.value}:null,qr:recipient.qr?{objectKey:recipient.qr.objectKey,contentType:recipient.qr.contentType,size:recipient.qr.size}:null,visible:recipient.visible}:undefined},step:form.step,numbers:{prices:cleanMap(form.numbers.prices),itemVat:cleanMap(form.numbers.itemVat),itemService:cleanMap(form.numbers.itemService),vat:form.numbers.vat,service:form.numbers.service},paymentReentryRequired:omitted};
  return persistedFormSchema.parse(result);
}
export function changePromptPayType(recipient:RecipientData,type:"phone"|"national-id"|null):RecipientData {
  return {...recipient,promptPay:type?{type,value:""}:null};
}
export function validateFormForPublication(form:DraftForm,hasPendingQr=false):ValidationResult {
  const errors:string[]=[];
  if(invalidNumberFields(form).length)errors.push("ตรวจสอบราคาและเปอร์เซ็นต์ที่ยังกรอกไม่ครบหรือไม่ถูกต้อง");
  const normalized=normalizeFormNumbers(form), bill=validateBillDraft(normalized.draft),payment=validateRecipient(normalized.draft.recipient,hasPendingQr);
  if(!bill.valid)errors.push(...bill.errors);if(!payment.valid)errors.push(...payment.errors);
  const parsed=formInputSchema.safeParse({draft:normalized.draft,step:normalized.step,numbers:normalized.numbers});
  if(!parsed.success)errors.push("ข้อมูลบิลไม่ถูกต้องหรือมีขนาดเกินกำหนด");
  else {
    const result=calculateBill(normalized.draft);
    if(![result.subtotalSatang,result.serviceChargeSatang,result.vatSatang,result.grossTotalSatang,result.collectedTotalSatang].every(n=>Number.isSafeInteger(n)&&n>=0))errors.push("ยอดรวมเกินขอบเขตที่คำนวณได้");
  }
  return errors.length?{valid:false,errors:[...new Set(errors)]}:{valid:true,errors:[]};
}
export function hasMeaningfulDraft(form:DraftForm,hasLocalQr=false) {
  const d=form.draft,r=d.recipient;
  return Boolean(hasLocalQr||d.participants.length>1||d.items.length>1||Object.values(form.numbers.itemVat).some(Boolean)||Object.values(form.numbers.itemService).some(Boolean)||form.numbers.vat||form.numbers.service||d.title||d.participants.some(p=>p.name)||d.items.some(i=>i.name||i.priceSatang)||d.vatPercent||d.serviceChargePercent||r?.name||r?.bank||r?.promptPay||r?.qr||Object.values(form.numbers.prices).some(Boolean));
}
