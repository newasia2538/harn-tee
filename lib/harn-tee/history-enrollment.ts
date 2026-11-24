import {idbRequest as request} from "./browser-db";
import {hasMeaningfulDraft,parseStoredCheckpoint,type Checkpoint,type CompletionCheckpoint} from "./draft-state";
import {NORMAL_LIFETIME_MS,sameDraftActivity,type LifecycleSnapshot} from "./bill-lifecycle";
import {selectLiveTotals} from "./live-totals";
import {historyInTransaction,storageConflict} from "./history-store";
import type {ActiveHistoryEntry} from "./history-state";
function receiptTokens(record:CompletionCheckpoint){
 try{const edit=new URL(record.editUrl).pathname.match(/^\/edit\/([A-Za-z0-9_-]+)$/)?.[1],share=new URL(record.shareUrl).pathname.match(/^\/share\/([A-Za-z0-9_-]+)$/)?.[1];return {editToken:edit,shareToken:share};}catch{return {};}
}
const initialLifecycle=(now:number):LifecycleSnapshot=>({lastActivityAt:now,allPaidAt:null,expiresAt:now+NORMAL_LIFETIME_MS,paymentStatus:"draft",paidCount:0,payerCount:0});
export async function enrollCheckpoint(tx:IDBTransaction,input:Checkpoint,previous?:Checkpoint,legacy=false):Promise<Checkpoint>{
 const remote=input.kind==="working"?input.remote:undefined,billId=input.kind==="complete"?input.billId:remote?.id;
 const history=await historyInTransaction(tx,input.localId,billId);
 if(history?.kind==="deleting"||history?.pendingDelete)return storageConflict();
 const provenance=input.provenance??previous?.provenance;
 const creatorWorking=provenance!=="edit-only"&&input.kind==="working"&&Boolean(input.creationKey||(!input.remote&&input.provenance!=="edit-only"));
 const created=Boolean(history||provenance==="created-here"||input.kind==="complete"&&provenance!=="edit-only"||creatorWorking);
 const record={...input,provenance:created?"created-here" as const:"edit-only" as const};
 if(!created||record.kind==="working"&&!hasMeaningfulDraft(record.form,record.qr.kind==="local")&&!history)return record;
 const before=previous?.kind==="working"?previous:undefined;
 const meaningful=record.kind==="working"&&(!before||!sameDraftActivity(before.form,record.form)||JSON.stringify(before.qr)!==JSON.stringify(record.qr));
 const now=Date.now(),local=!(billId||remote);
 const revision=remote?.revision??(record.kind==="complete"?record.revision:undefined),serverVersion=remote?.serverVersion??(record.kind==="complete"?record.serverVersion:undefined);
 // A local save is not proof that its old server acknowledgement is newer than a history sync.
 const historyAdvanced=Boolean(history?.revision&&revision&&history.revision!==revision&&(
   history.serverVersion!==undefined?(serverVersion===undefined||serverVersion<history.serverVersion):history.revision!==before?.remote?.revision
 ));
 let lifecycle=historyAdvanced?history?.lifecycle:remote?.lifecycle??record.lifecycle??history?.lifecycle;
 if(local){lifecycle=history?.lifecycle??record.lifecycle;if(!lifecycle||meaningful&&!legacy)lifecycle=initialLifecycle(now);}
 else if(!lifecycle)lifecycle={lastActivityAt:0,allPaidAt:null,expiresAt:0,paymentStatus:record.kind==="complete"||remote?.status==="published"?"unpaid":"draft",paidCount:0,payerCount:0};
 lifecycle??=initialLifecycle(now);
 const form=record.kind==="working"?record.form:before?.form,links=record.kind==="complete"?receiptTokens(record):{};
 const entry:ActiveHistoryEntry={
  kind:"bill",schemaVersion:1,localId:history?.localId??record.localId,recordIds:[...new Set([...(history?.recordIds??[]),record.localId])],billId:billId??history?.billId,
  editToken:remote?.editToken??links.editToken??history?.editToken,shareToken:historyAdvanced?history?.shareToken:remote?.shareToken??links.shareToken??history?.shareToken,
  revision:historyAdvanced?history?.revision:revision??history?.revision,serverVersion:historyAdvanced?history?.serverVersion:serverVersion??history?.serverVersion,
  title:!historyAdvanced&&form?form.draft.title??"":history?.title??"",totalSatang:!historyAdvanced&&form?selectLiveTotals(form).calculation.grossTotalSatang:history?.totalSatang??0,
  lifecycle,deadlineSource:local?"local":"server",localVersion:(history?.localVersion??-1)+1,
  syncState:historyAdvanced&&record.kind==="working"?"conflict":local?"synced":meaningful&&remote?.revision===history?.revision?"pending":remote?.lifecycle||record.lifecycle?"synced":"pending",shareUsable:history?.shareUsable??false,
 };
 await request(tx.objectStore("history").put(entry,entry.localId));await request(tx.objectStore("aliases").put({localId:record.localId},"local:"+record.localId));
 return {...record,lifecycle};
}
/** Discover only prior creator work; no edit-link visitor is promoted. */
export async function migrateHistory(tx:IDBTransaction){
 const records=tx.objectStore("records"),aliases=tx.objectStore("aliases");
 for(const value of await request<unknown[]>(records.getAll())){
  const record=parseStoredCheckpoint(value);
  if(record.provenance)continue;
  const keys=await request(aliases.index("localId").getAllKeys(record.localId));
  const created=record.kind==="complete"||record.kind==="working"&&Boolean(record.creationKey||(!record.remote&&keys.includes("new")));
  const next=await enrollCheckpoint(tx,{...record,provenance:created?"created-here":"edit-only"},record,true);
  await request(records.put(next,record.localId));
 }
}
