import { z } from "zod";
import { formInputSchema, type WriteResult } from "./draft-state";
import { readJsonBody, InvalidJsonBodyError, RequestBodyTooLargeError } from "./request-body";

export class DraftRequestError extends Error {constructor(public status:number,public code:string){super(code);}}
const wireForm=formInputSchema.extend({paymentReentryRequired:z.boolean().optional()}).superRefine((form,ctx)=>{
  const ids=new Set(form.draft.participants.map(p=>p.id)),items=new Set(form.draft.items.map(i=>i.id));
  if(ids.size!==form.draft.participants.length||items.size!==form.draft.items.length||form.draft.items.some(i=>i.payerIds.some(id=>!ids.has(id))||new Set(i.payerIds).size!==i.payerIds.length))ctx.addIssue({code:"custom",message:"Invalid references"});
  if(form.draft.recipient?.qr)ctx.addIssue({code:"custom",message:"QR keys are server owned"});
  if([form.numbers.prices,form.numbers.itemVat,form.numbers.itemService].some(m=>Object.keys(m).some(id=>!items.has(id))))ctx.addIssue({code:"custom",message:"Unknown item input"});
});
export const createDraftRequestSchema=z.object({creationKey:z.string().regex(/^[A-Za-z0-9_-]{43}$/),form:wireForm}).strict();
export const saveDraftRequestSchema=z.object({form:wireForm}).strict();
export const publishDraftRequestSchema=z.object({form:wireForm,confirmationId:z.string().min(1).max(80),shareToken:z.string().min(1).max(200).optional()}).strict();
export const emptyDraftRequestSchema=z.object({}).strict();
export async function draftBody<S extends z.ZodTypeAny>(request:Request,schema:S):Promise<z.infer<S>>{
  const parsed=schema.safeParse(await readJsonBody(request,1024*1024));
  if(!parsed.success)throw new DraftRequestError(400,"invalid-input");return parsed.data;
}
export function requiredRevision(request:Request):string {
  const header=request.headers.get("If-Match");if(!header)throw new DraftRequestError(428,"precondition-required");
  const match=header.match(/^"([A-Za-z0-9_-]{43})"$/);if(!match)throw new DraftRequestError(400,"invalid-precondition");return match[1];
}
export function draftJson(data:unknown,status=200,revision?:string){
  return Response.json(data,{status,headers:{"Cache-Control":"no-store",...(revision?{ETag:`"${revision}"`}:{})}});
}
export function draftResult<T>(result:WriteResult<T>){
  if(result.kind==="not-found")return draftJson({error:"ไม่พบข้อมูลบิลนี้"},404);
  if(result.kind==="conflict")return draftJson({error:"ข้อมูลบิลเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุด",code:result.code??"revision-conflict"},409);
  const revision=result.value&&typeof result.value==="object"&&"revision" in result.value?String(result.value.revision):undefined;
  return draftJson(result.value,200,revision);
}
export async function withDraftErrors(action:()=>Promise<Response>):Promise<Response>{
  try{return await action();}catch(error){
    if(error instanceof DraftRequestError)return draftJson({error:"ข้อมูลหรือเงื่อนไขการบันทึกไม่ถูกต้อง",code:error.code},error.status);
    if(error instanceof RequestBodyTooLargeError)return draftJson({error:"ข้อมูลมีขนาดใหญ่เกินไป"},413);
    if(error instanceof InvalidJsonBodyError)return draftJson({error:"รูปแบบข้อมูลไม่ถูกต้อง"},400);
    if(error instanceof Error&&error.message==="invalid-bill"&&"errors" in error)return draftJson({error:"กรุณาตรวจสอบข้อมูลก่อนยืนยัน",errors:error.errors},400);
    if(error instanceof Error&&["revision-conflict","not-draft","share-proof-stale"].includes(error.message))return draftJson({error:"ข้อมูลบิลเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุด",code:error.message},409);
    console.error("draft-operation-failed");return draftJson({error:"บันทึกไม่สำเร็จ กรุณาลองใหม่"},500);
  }
}
