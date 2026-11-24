import {BILL_COLUMNS,backfillLegacyBatch,type RetentionBindings,type StoredBillRow} from "./bill-retention-store";
import {drainBillQrCleanup,revokeBillSnapshot} from "./bill-deletion";
import {drainQueuedQrAssets} from "./bill-qr-assets";

export async function runBillMaintenance(bindings:RetentionBindings,now:number):Promise<void>{
  const claimed=await bindings.DB.prepare("UPDATE bill_retention_policy SET maintenance_next_run_at = ?1 WHERE id = 'lifecycle-v1' AND maintenance_next_run_at <= ?2").bind(now+60_000,now).run();
  if(claimed.meta.changes!==1)return;
  await backfillLegacyBatch(bindings,5);
  const expired=await bindings.DB.prepare("SELECT "+BILL_COLUMNS+" FROM bills WHERE expires_at <= ?1 ORDER BY expires_at LIMIT 10").bind(now).all<StoredBillRow>();
  for(const row of expired.results)await revokeBillSnapshot(bindings,row,"expired",now);
  const pending=await bindings.DB.prepare("SELECT id FROM bill_deletions WHERE state = 'deleting' AND next_attempt_at <= ?1 ORDER BY next_attempt_at,id LIMIT 1").bind(now).first<{id:string}>();
  if(pending)await drainBillQrCleanup(bindings,pending.id,now,20);
  else await drainQueuedQrAssets(bindings,now,20);
}
