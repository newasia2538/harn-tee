import type {RetentionBindings,StoredBillRow} from "./bill-retention-store";
import {drainQueuedQrAssets,ownsQrKey,qrRetryDelay} from "./bill-qr-assets";

export type DeletionMarker={id:string;state:"deleting"|"deleted";scan_cursor:string|null;scan_complete:number;next_attempt_at:number;attempts:number};
export async function revokeBillSnapshot(bindings:RetentionBindings,row:StoredBillRow,reason:"manual"|"expired",now:number):Promise<"revoked"|"conflict">{
  const condition="id = ?1 AND payload_json = ?2 AND share_token_digest = ?3 AND retention_version = ?4 AND expires_at "+(reason==="expired"?"<=":">")+" ?5";
  const base=[row.id,row.payload_json,row.share_token_digest,row.retention_version,now];
  const statements=[bindings.DB.prepare("INSERT INTO bill_deletions (id,share_token_digest,edit_token_digest,deleted_at,reason,state) SELECT id,share_token_digest,edit_token_digest,?5,?6,'deleting' FROM bills WHERE "+condition).bind(...base,reason)];
  let key:unknown;try{key=JSON.parse(row.payload_json).recipient?.qr?.objectKey;}catch{/* Prefix sweep still handles an unreadable legacy payload. */}
  if(typeof key==="string"&&ownsQrKey(row.id,key))statements.push(bindings.DB.prepare("INSERT OR IGNORE INTO bill_qr_assets (object_key,bill_id,put_settled,cleanup_requested) SELECT ?6,id,1,1 FROM bills WHERE "+condition).bind(...base,key));
  statements.push(bindings.DB.prepare("UPDATE bill_qr_assets SET cleanup_requested = 1, attached = 0, next_attempt_at = 0 WHERE bill_id = ?1 AND EXISTS (SELECT 1 FROM bills WHERE "+condition+")").bind(...base));
  statements.push(bindings.DB.prepare("DELETE FROM bills WHERE "+condition).bind(...base));
  const result=await bindings.DB.batch(statements);
  return result.at(-1)!.meta.changes===1?"revoked":"conflict";
}

export async function drainBillQrCleanup(bindings:RetentionBindings,billId:string,now:number,maxObjects:number):Promise<"deleting"|"deleted">{
  const marker=await bindings.DB.prepare("SELECT id,state,scan_cursor,scan_complete,next_attempt_at,attempts FROM bill_deletions WHERE id = ?1").bind(billId).first<DeletionMarker>();
  if(marker?.state==="deleted")return "deleted";
  if(!marker||!bindings.BUCKET||marker.next_attempt_at>now||maxObjects<=0)return "deleting";
  if(!marker.scan_complete){
    try{
      const page=await bindings.BUCKET.list({prefix:`bills/${billId}/`,limit:100,...(marker.scan_cursor?{cursor:marker.scan_cursor}:{})});
      const keys=page.objects.map(object=>object.key).filter(key=>ownsQrKey(billId,key));
      if(keys.length)await bindings.DB.batch(keys.map(key=>bindings.DB.prepare("INSERT INTO bill_qr_assets (object_key,bill_id,put_settled,cleanup_requested) SELECT ?1,?2,1,1 WHERE EXISTS (SELECT 1 FROM bill_deletions WHERE id = ?2 AND state = 'deleting') ON CONFLICT(object_key) DO UPDATE SET cleanup_requested = 1").bind(key,billId)));
      if(page.truncated&&!page.cursor)throw new Error("invalid-r2-list-cursor");
      await bindings.DB.prepare("UPDATE bill_deletions SET scan_cursor = ?1, scan_complete = ?2 WHERE id = ?3 AND state = 'deleting' AND scan_cursor IS ?4 AND scan_complete = 0").bind(page.truncated?page.cursor:null,page.truncated?0:1,billId,marker.scan_cursor).run();
    }catch{
      await bindings.DB.prepare("UPDATE bill_deletions SET next_attempt_at = ?1, attempts = attempts + 1 WHERE id = ?2 AND state = 'deleting'").bind(now+qrRetryDelay(marker.attempts),billId).run();
      return "deleting";
    }
  }
  await drainQueuedQrAssets(bindings,now,maxObjects,billId);
  await bindings.DB.prepare("UPDATE bill_deletions SET state = 'deleted', scan_cursor = NULL, attempts = 0, next_attempt_at = 0 WHERE id = ?1 AND state = 'deleting' AND scan_complete = 1 AND NOT EXISTS (SELECT 1 FROM bill_qr_assets WHERE bill_id = ?1)").bind(billId).run();
  const current=await bindings.DB.prepare("SELECT state FROM bill_deletions WHERE id = ?1").bind(billId).first<{state:"deleting"|"deleted"}>();
  if(current?.state==="deleted")return "deleted";
  const retry=await bindings.DB.prepare("SELECT MIN(next_attempt_at) AS retry FROM bill_qr_assets WHERE bill_id = ?1").bind(billId).first<{retry:number|null}>();
  await bindings.DB.prepare("UPDATE bill_deletions SET next_attempt_at = ?1 WHERE id = ?2 AND state = 'deleting'").bind(Math.max(now+1000,retry?.retry??now+1000),billId).run();
  return "deleting";
}
