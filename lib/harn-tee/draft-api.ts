import {billServerClock} from "./bill-clock";
import type {LifecycleSnapshot} from "./bill-lifecycle";
import {formInputSchema,sanitizeDraftForm,type DraftAck,type DraftForm,type SafeDraftForm} from "./draft-state";
export class DraftApiError extends Error {
  constructor(public status:number,public code:string){super(code);}
}
export interface DraftApi {
  create(key:string,form:SafeDraftForm,signal?:AbortSignal):Promise<DraftAck&{editToken:string;shareToken?:string}>;
  load(token:string,signal?:AbortSignal):Promise<DraftAck>;
  save(token:string,revision:string,form:SafeDraftForm,signal?:AbortSignal):Promise<DraftAck>;
  uploadQr(token:string,revision:string,file:File,mode:"draft"|"confirm",signal?:AbortSignal,selectionId?:string):Promise<DraftAck>;
  issueShare(token:string,revision:string,signal?:AbortSignal):Promise<{shareToken:string;revision:string;serverVersion?:number;lifecycle?:LifecycleSnapshot;serverNow?:number}>;
  publish(token:string,revision:string,form:DraftForm,confirmationId:string,shareToken?:string,signal?:AbortSignal):Promise<DraftAck>;
}
function draftWire(form:DraftForm){const safe=sanitizeDraftForm(form);return {...safe,draft:{...safe.draft,recipient:safe.draft.recipient?{...safe.draft.recipient,qr:null}:undefined}};}
function publicationWire(form:DraftForm){return formInputSchema.parse({draft:{...form.draft,recipient:form.draft.recipient?{...form.draft.recipient,qr:null}:undefined},step:form.step,numbers:form.numbers});}
export function createDraftApi(fetcher:typeof fetch=globalThis.fetch):DraftApi {
  const base=(token:string)=>"/api/bills/"+encodeURIComponent(token);
  async function send<T>(url:string,init:RequestInit):Promise<T>{
    let response:Response;
    try{response=await fetcher(url,{cache:"no-store",...init});}catch(error){if(error instanceof Error&&error.name==="AbortError")throw error;throw new DraftApiError(0,"network");}
    let body:unknown;try{body=await response.json();}catch{throw new DraftApiError(response.status,"invalid-response");}
    if(!response.ok){
      const code=body&&typeof body==="object"&&"code" in body?body.code:null;
      const safe=typeof code==="string"&&["bill-deleting","bill-deleted","revision-conflict","not-draft","share-proof-stale","precondition-required","invalid-precondition","invalid-input"].includes(code)?code:response.status===404?"not-found":response.status===400?"invalid-input":"server-error";
      throw new DraftApiError(response.status,safe);
    }
    if(!body||typeof body!=="object"||!("revision" in body)||typeof body.revision!=="string")throw new DraftApiError(500,"invalid-response");
    if("serverNow" in body&&typeof body.serverNow==="number")billServerClock.sync(body.serverNow);
    return body as T;
  }
  const json=(method:string,body:unknown,revision?:string,signal?:AbortSignal):RequestInit=>({method,headers:{"Content-Type":"application/json",...(revision?{"If-Match":`"${revision}"`}:{})},body:JSON.stringify(body),signal});
  return {
    create:(key,form,signal)=>send("/api/bills/drafts",json("POST",{creationKey:key,form:draftWire(form)},undefined,signal)),
    load:(token,signal)=>send(base(token)+"/draft",{method:"GET",signal}),
    save:(token,revision,form,signal)=>send(base(token)+"/draft",json("PUT",{form:draftWire(form)},revision,signal)),
    uploadQr:(token,revision,file,mode,signal,selectionId)=>{const body=new FormData();body.append("file",file);return send(base(token)+"/qr",{method:"POST",headers:{"If-Match":`"${revision}"`,"X-Harn-Tee-Save-Mode":mode,...(selectionId?{"X-Harn-Tee-Qr-Selection":selectionId}:{})},body,signal});},
    issueShare:(token,revision,signal)=>send(base(token)+"/share-capability",json("POST",{},revision,signal)),
    publish:(token,revision,form,confirmationId,shareToken,signal)=>send(base(token)+"/publish",json("POST",{form:publicationWire(form),confirmationId,shareToken},revision,signal)),
  };
}
