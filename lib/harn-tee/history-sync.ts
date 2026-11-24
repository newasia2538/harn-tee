import {DraftApiError} from "./draft-api";
import {DraftStorageError} from "./browser-db";
import type {HistoryStore} from "./history-store";
import type {HistoryApi} from "./history-api";
import type {HistoryEntry,ActiveHistoryEntry} from "./history-state";
import type {createRetentionClock} from "./retention-clock";
import {broadcastBillEvent} from "./bill-events";
export function createHistorySync({store,api,clock}:{store:HistoryStore;api:HistoryApi;clock:ReturnType<typeof createRetentionClock>}){
 let disposed=false,inFlight:Promise<void>|undefined,lastAuto=-Infinity;
 const abort=new AbortController(),listeners=new Set<()=>void>(),notify=()=>{if(!disposed)for(const listener of listeners)listener();};
 async function apply(run:()=>Promise<unknown>){if(disposed)return;try{await run();}catch(error){if(!(error instanceof DraftStorageError&&error.code==="storage-conflict"))throw error;}}
 async function deleteRemote(entry:HistoryEntry){
  if(!entry.editToken)return;const revision=entry.kind==="bill"?entry.pendingDelete?.revision:entry.revision;if(!revision)return;
  try{
   const result=await api.remove(entry.editToken,revision,abort.signal);if(disposed)return;clock.sync(result.serverNow);
   await apply(()=>store.confirmRevocation(entry.localId,entry.localVersion,result));if(entry.billId)broadcastBillEvent({billId:entry.billId,kind:result.state});
  }catch(error){
   if(disposed)return;
   if(error instanceof DraftApiError&&error.status===410){const state=error.code==="bill-deleted"?"deleted":"deleting";await apply(()=>store.confirmRevocation(entry.localId,entry.localVersion,{state,serverNow:clock.now()??Date.now()}));if(entry.billId)broadcastBillEvent({billId:entry.billId,kind:state});}
   else if(entry.kind==="bill")await apply(()=>store.upsert({...entry,syncState:error instanceof DraftApiError&&error.status===409?"conflict":"offline"},entry.localVersion));
  }
 }
 async function run(reason:string){
  try{
   if(reason==="entry"){try{const result=await api.maintain(abort.signal);if(!disposed)clock.sync(result.serverNow);}catch{/* History remains available when maintenance is offline. */}}
   let entries=await store.list();if(disposed)return;
   for(const entry of entries){
    if(entry.kind==="bill"&&!entry.billId&&entry.lifecycle.expiresAt<=Date.now())await apply(()=>store.purge(entry.localId,entry.localVersion));
    else if(entry.kind==="deleting"||entry.pendingDelete&&entry.syncState!=="conflict")await deleteRemote(entry);
   }
   entries=await store.list();if(disposed)return;
   const proofs=entries.filter((e):e is ActiveHistoryEntry=>e.kind==="bill"&&Boolean(e.editToken)&&(!e.pendingDelete||e.syncState==="conflict"));
   for(let i=0;i<proofs.length;i+=20){
    const batch=proofs.slice(i,i+20);
    try{
     const response=await api.sync(batch.map(e=>({localId:e.localId,editToken:e.editToken!,...(e.shareToken?{shareToken:e.shareToken}:{})})),abort.signal);if(disposed)return;clock.sync(response.serverNow);
     for(const item of response.items){const entry=batch.find(e=>e.localId===item.localId);if(!entry)continue;
      if(item.kind==="gone"){await apply(()=>store.confirmRevocation(entry.localId,entry.localVersion,{state:item.state,serverNow:response.serverNow}));if(entry.billId)broadcastBillEvent({billId:entry.billId,kind:item.state});}
      else if(item.kind==="missing")await apply(()=>store.upsert({...entry,syncState:"conflict",shareUsable:false},entry.localVersion));
      else{
       const changed=Boolean(entry.revision&&entry.revision!==item.summary.revision),conflict=changed&&(entry.syncState==="pending"||entry.syncState==="offline"||entry.syncState==="conflict");
       await apply(()=>store.upsert({...entry,billId:item.summary.id,revision:item.summary.revision,serverVersion:item.summary.serverVersion,lifecycle:item.summary.lifecycle,...(!conflict?{title:item.summary.title,totalSatang:item.summary.totalSatang}:{}),deadlineSource:"server",shareUsable:item.shareUsable,syncState:conflict||entry.pendingDelete?"conflict":"synced"},entry.localVersion));
       if(changed&&entry.billId)broadcastBillEvent({billId:entry.billId,kind:"updated"});
      }
     }
    }catch(error){if(disposed)return;for(const entry of batch)await apply(()=>store.upsert({...entry,syncState:entry.syncState==="conflict"?"conflict":"offline"},entry.localVersion));if(reason==="manual")throw error;}
   }
  }finally{notify();}
 }
 return {
  refresh(reason:"entry"|"foreground"|"online"|"manual"){
   if(disposed)return Promise.resolve();if(inFlight)return inFlight;
   if(reason!=="manual"&&performance.now()-lastAuto<15000)return Promise.resolve();if(reason!=="manual")lastAuto=performance.now();
   inFlight=run(reason).finally(()=>{inFlight=undefined;});return inFlight;
  },
  async remove(entry:HistoryEntry){
   if(disposed)return;
   if(entry.kind==="bill"&&!entry.billId){await store.purge(entry.localId,entry.localVersion);notify();return;}
   const pending=entry.kind==="bill"?await store.markPendingDelete(entry.localId,entry.localVersion,entry.revision??""):entry;notify();await deleteRemote(pending);notify();
  },
  subscribe(listener:()=>void){listeners.add(listener);return ()=>{listeners.delete(listener);};},
  dispose(){disposed=true;abort.abort();listeners.clear();},
 };
}
