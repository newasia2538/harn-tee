import {billServerClock} from "./bill-clock";
import {DraftApiError} from "./draft-api";
import type {DeleteResult} from "./bill-lifecycle";
import type {HistorySyncProof,HistorySyncResponse} from "./history-state";
export interface HistoryApi{
 sync(entries:HistorySyncProof[],signal?:AbortSignal):Promise<HistorySyncResponse>;
 remove(editToken:string,revision:string,signal?:AbortSignal):Promise<DeleteResult>;
 maintain(signal?:AbortSignal):Promise<{serverNow:number}>;
}
export function createHistoryApi(fetcher:typeof fetch=globalThis.fetch):HistoryApi{
 async function send<T>(url:string,init:RequestInit):Promise<T>{
  let response:Response;try{response=await fetcher(url,{cache:"no-store",...init});}catch(error){if(error instanceof Error&&error.name==="AbortError")throw error;throw new DraftApiError(0,"network");}
  let body:unknown;try{body=await response.json();}catch{throw new DraftApiError(response.status,"invalid-response");}
  if(!response.ok){const code=body&&typeof body==="object"&&"code" in body?body.code:null;throw new DraftApiError(response.status,typeof code==="string"&&["revision-conflict","bill-deleting","bill-deleted"].includes(code)?code:response.status===404?"not-found":"server-error");}
  if(!body||typeof body!=="object"||!("serverNow" in body)||typeof body.serverNow!=="number")throw new DraftApiError(500,"invalid-response");billServerClock.sync(body.serverNow);return body as T;
 }
 const post=(body:unknown,signal?:AbortSignal)=>({method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal});
 return {
  sync:(entries,signal)=>{if(entries.length>20)throw new DraftApiError(400,"invalid-input");return send("/api/bills/history",post({entries},signal));},
  remove:(token,revision,signal)=>send("/api/bills/"+encodeURIComponent(token),{method:"DELETE",headers:{"If-Match":`"${revision}"`},signal}),
  maintain:signal=>send("/api/bills/maintenance",post({},signal)),
 };
}
