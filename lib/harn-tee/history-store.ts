import {notifyHistoryChanged} from "./bill-events";
import {z} from "zod";
import {DraftStorageError,idbRequest as request,type BrowserDb} from "./browser-db";
import type {ActiveHistoryEntry,HistoryEntry,PendingHistoryEntry} from "./history-state";
import type {DeleteResult} from "./bill-lifecycle";
const key=z.string().min(1).max(200),count=z.number().int().nonnegative(),sync=z.enum(["synced","pending","offline","conflict"]);
const lifecycle=z.object({lastActivityAt:count,allPaidAt:count.nullable(),expiresAt:count,paymentStatus:z.enum(["draft","unpaid","partial","paid"]),paidCount:count,payerCount:count}).strict();
const active=z.object({kind:z.literal("bill"),schemaVersion:z.literal(1),localId:key,recordIds:z.array(key),billId:key.optional(),editToken:key.optional(),shareToken:key.optional(),revision:key.optional(),title:z.string().max(200),totalSatang:count.max(Number.MAX_SAFE_INTEGER),lifecycle,deadlineSource:z.enum(["local","server"]),localVersion:count,syncState:sync,pendingDelete:z.object({revision:key,requestedAt:count}).strict().optional(),shareUsable:z.boolean()}).strict();
const pending=z.object({kind:z.literal("deleting"),schemaVersion:z.literal(1),localId:key,billId:key,editToken:key,revision:key,localVersion:count,requestedAt:count,syncState:sync}).strict();
export const parseHistoryEntry=(value:unknown):HistoryEntry=>z.discriminatedUnion("kind",[active,pending]).parse(value);
export interface HistoryStore{
 list():Promise<HistoryEntry[]>;
 upsert(entry:ActiveHistoryEntry,expectedVersion:number|null):Promise<ActiveHistoryEntry>;
 purge(localId:string,expectedVersion:number):Promise<void>;
 markPendingDelete(localId:string,expectedVersion:number,revision:string):Promise<ActiveHistoryEntry>;
 confirmRevocation(localId:string,expectedVersion:number,result:DeleteResult):Promise<PendingHistoryEntry|null>;
}
export const storageConflict=():never=>{throw new DraftStorageError("storage-conflict");};
export async function historyInTransaction(tx:IDBTransaction,localId:string,billId?:string):Promise<HistoryEntry|undefined>{
 const store=tx.objectStore("history"),value=await request<unknown>(store.get(localId))??(billId?await request<unknown>(store.index("billId").get(billId)):undefined);return value?parseHistoryEntry(value):undefined;
}
async function current(tx:IDBTransaction,id:string,version:number){const found=await historyInTransaction(tx,id);if(!found||found.localVersion!==version)return storageConflict();return found;}
export async function clearOwnedData(tx:IDBTransaction,entry:HistoryEntry){
 if(entry.kind!=="bill")return;
 for(const id of entry.recordIds){
  await request(tx.objectStore("records").delete(id));
  for(const name of ["aliases","qrAssets"]){const store=tx.objectStore(name);for(const key of await request(store.index("localId").getAllKeys(id)))await request(store.delete(key));}
 }
}
export function createHistoryStore(database:BrowserDb):HistoryStore{
 const transaction:BrowserDb["transaction"]=async(mode,run)=>{const value=await database.transaction(mode,run);if(mode==="readwrite")notifyHistoryChanged();return value;};
 return {
  list:()=>transaction("readonly",async tx=>(await request<unknown[]>(tx.objectStore("history").getAll())).map(parseHistoryEntry)),
  upsert:(entry,expected)=>transaction("readwrite",async tx=>{const found=await historyInTransaction(tx,entry.localId);if(expected===null?Boolean(found):!found||found.localVersion!==expected||found.kind!=="bill")return storageConflict();const safe=active.parse({...entry,localVersion:(expected??-1)+1});await request(tx.objectStore("history").put(safe,safe.localId));return safe;}),
  purge:(id,version)=>transaction("readwrite",async tx=>{const entry=await current(tx,id,version);await clearOwnedData(tx,entry);await request(tx.objectStore("history").delete(id));}),
  markPendingDelete:(id,version,revision)=>transaction("readwrite",async tx=>{const entry=await current(tx,id,version);if(entry.kind!=="bill")return storageConflict();const updated={...entry,pendingDelete:{revision,requestedAt:Date.now()},localVersion:version+1,syncState:"pending" as const};await request(tx.objectStore("history").put(updated,id));return updated;}),
  confirmRevocation:(id,version,result)=>transaction("readwrite",async tx=>{
   const entry=await current(tx,id,version);await clearOwnedData(tx,entry);
   if(result.state==="deleted"){await request(tx.objectStore("history").delete(id));return null;}
   if(!entry.billId||!entry.editToken)return storageConflict();
   const minimal:PendingHistoryEntry={kind:"deleting",schemaVersion:1,localId:id,billId:entry.billId,editToken:entry.editToken,revision:entry.kind==="bill"?entry.pendingDelete?.revision??entry.revision??"0".repeat(43):entry.revision,localVersion:version+1,requestedAt:entry.kind==="bill"?entry.pendingDelete?.requestedAt??result.serverNow:entry.requestedAt,syncState:"pending"};
   await request(tx.objectStore("history").put(minimal,id));return minimal;
  }),
 };
}
