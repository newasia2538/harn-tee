import type {RetentionBindings,StoredBillRow} from "./bill-retention-store";

export function ownsQrKey(billId:string,key:string){return key.startsWith(`bills/${billId}/`)&&key.length>billId.length+7;}
export const qrRetryDelay=(attempts:number)=>Math.min(3_600_000,30_000*2**Math.min(attempts,7));
export async function registerQrAsset(bindings:RetentionBindings,row:StoredBillRow,objectKey:string,selectionId:string|undefined,now:number):Promise<boolean>{
  if(!ownsQrKey(row.id,objectKey))throw new Error("invalid-qr-key");
  const result=await bindings.DB.prepare("INSERT OR IGNORE INTO bill_qr_assets (object_key,bill_id,selection_id) SELECT ?1,id,?2 FROM bills WHERE id = ?3 AND payload_json = ?4 AND share_token_digest = ?5 AND retention_version = ?6 AND expires_at > ?7 AND NOT EXISTS (SELECT 1 FROM bill_deletions WHERE id = ?3)")
    .bind(objectKey,selectionId??null,row.id,row.payload_json,row.share_token_digest,row.retention_version,now).run();
  return result.meta.changes===1;
}
export async function settleQrAsset(bindings:RetentionBindings,objectKey:string,outcome:"stored"|"uncertain",now:number):Promise<void>{
  await bindings.DB.batch([
    bindings.DB.prepare("UPDATE bill_qr_assets SET put_settled = MAX(put_settled,?1), cleanup_requested = CASE WHEN EXISTS (SELECT 1 FROM bill_deletions WHERE id = bill_id) THEN 1 ELSE cleanup_requested END, next_attempt_at = ?2 WHERE object_key = ?3").bind(outcome==="stored"?1:0,now,objectKey),
    bindings.DB.prepare("UPDATE bill_deletions SET next_attempt_at = ?1 WHERE state = 'deleting' AND id = (SELECT bill_id FROM bill_qr_assets WHERE object_key = ?2)").bind(now,objectKey),
  ]);
}
export async function queueQrCleanup(bindings:RetentionBindings,objectKey:string,now:number):Promise<void>{
  await bindings.DB.prepare("UPDATE bill_qr_assets SET cleanup_requested = 1, attached = 0, next_attempt_at = ?1 WHERE object_key = ?2").bind(now,objectKey).run();
}
export function qrAttachmentStatements(bindings:RetentionBindings,input:{billId:string;objectKey:string;previousKey?:string;payloadJson:string;retentionVersion:number}):D1PreparedStatement[]{
  const {billId,objectKey,previousKey,payloadJson,retentionVersion}=input;
  const statements=[bindings.DB.prepare("UPDATE bill_qr_assets SET attached = 1 WHERE object_key = ?1 AND put_settled = 1 AND cleanup_requested = 0 AND EXISTS (SELECT 1 FROM bills WHERE id = ?2 AND payload_json = ?3 AND retention_version = ?4)").bind(objectKey,billId,payloadJson,retentionVersion)];
  if(previousKey&&previousKey!==objectKey&&ownsQrKey(billId,previousKey)){
    statements.push(bindings.DB.prepare("INSERT INTO bill_qr_assets (object_key,bill_id,put_settled,cleanup_requested) SELECT ?1,?2,1,1 WHERE EXISTS (SELECT 1 FROM bills WHERE id = ?2 AND payload_json = ?3 AND retention_version = ?4) ON CONFLICT(object_key) DO UPDATE SET cleanup_requested = 1, attached = 0, next_attempt_at = 0").bind(previousKey,billId,payloadJson,retentionVersion));
  }
  return statements;
}

type CleanupAsset={object_key:string;bill_id:string;put_settled:number;attempts:number};
/** Returned count is object attempts, allowing one shared maintenance budget. */
export async function drainQueuedQrAssets(bindings:RetentionBindings,now:number,maxObjects:number,billId?:string):Promise<number>{
  const limit=Math.max(0,Math.min(20,Math.floor(maxObjects)));if(!limit||!bindings.BUCKET)return 0;
  const result=await bindings.DB.prepare("SELECT object_key,bill_id,put_settled,attempts FROM bill_qr_assets a WHERE cleanup_requested = 1 AND next_attempt_at <= ?1"+(billId?" AND bill_id = ?3":"")+" AND NOT EXISTS (SELECT 1 FROM bills b WHERE b.id = a.bill_id AND json_extract(b.payload_json,'$.recipient.qr.objectKey') = a.object_key) ORDER BY next_attempt_at,object_key LIMIT ?2")
    .bind(now,limit,...(billId?[billId]:[])).all<CleanupAsset>();
  const assets=result.results.filter(asset=>ownsQrKey(asset.bill_id,asset.object_key));if(!assets.length)return 0;
  try{
    await bindings.BUCKET.delete(assets.map(asset=>asset.object_key));
    const settled=assets.filter(asset=>asset.put_settled===1),uncertain=assets.filter(asset=>asset.put_settled!==1);
    const statements:D1PreparedStatement[]=[];
    if(settled.length)statements.push(bindings.DB.prepare("DELETE FROM bill_qr_assets WHERE cleanup_requested = 1 AND put_settled = 1 AND object_key IN ("+settled.map((_,i)=>"?"+(i+1)).join(",")+")").bind(...settled.map(asset=>asset.object_key)));
    // Never drop a formerly in-flight entry just because it settled during R2.delete.
    for(const asset of uncertain)statements.push(bindings.DB.prepare("UPDATE bill_qr_assets SET next_attempt_at = ?1, attempts = attempts + 1 WHERE object_key = ?2 AND put_settled = 0").bind(now+qrRetryDelay(asset.attempts),asset.object_key));
    if(statements.length)await bindings.DB.batch(statements);
  }catch{
    await bindings.DB.batch(assets.map(asset=>bindings.DB.prepare("UPDATE bill_qr_assets SET next_attempt_at = ?1, attempts = attempts + 1 WHERE object_key = ?2").bind(now+qrRetryDelay(asset.attempts),asset.object_key)));
  }
  return assets.length;
}
