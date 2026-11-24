import {plainBill,type BillEnvelope} from "./draft-document";
import {NORMAL_LIFETIME_MS,PAID_LIFETIME_MS,paymentProgress,type BillLifecycle} from "../lib/harn-tee/bill-lifecycle";

export type StoredBillRow={id:string;share_token_digest:string;edit_token_digest:string;payload_json:string;created_at:number;updated_at:number;last_activity_at:number|null;all_paid_at:number|null;expires_at:number|null;retention_version:number};
export type RetentionBindings={DB:D1Database;BUCKET?:R2Bucket};
export const BILL_COLUMNS="id, share_token_digest, edit_token_digest, payload_json, created_at, updated_at, last_activity_at, all_paid_at, expires_at, retention_version";

export function rowLifecycle(row:StoredBillRow):BillLifecycle{
  if(row.expires_at===null||row.last_activity_at===null||!Number.isSafeInteger(row.expires_at)||!Number.isSafeInteger(row.last_activity_at)||(row.all_paid_at!==null&&!Number.isSafeInteger(row.all_paid_at)))throw new Error("bill-retention-uninitialized");
  return {lastActivityAt:row.last_activity_at,allPaidAt:row.all_paid_at,expiresAt:row.expires_at};
}
export async function retentionRolloutAt(bindings:RetentionBindings):Promise<number>{
  const policy=await bindings.DB.prepare("SELECT rollout_at FROM bill_retention_policy WHERE id = 'lifecycle-v1'").first<{rollout_at:number}>();
  if(!policy)throw new Error("bill-retention-policy-unavailable");
  return policy.rollout_at;
}
export async function initializeLegacyRow(bindings:RetentionBindings,row:StoredBillRow,rolloutAt:number):Promise<StoredBillRow|null>{
  if(row.expires_at!==null)return row;
  const complete=paymentProgress(plainBill(JSON.parse(row.payload_json) as BillEnvelope)).paymentStatus==="paid";
  const initialized={...row,last_activity_at:row.updated_at,all_paid_at:complete?rolloutAt:null,expires_at:rolloutAt+(complete?PAID_LIFETIME_MS:NORMAL_LIFETIME_MS),retention_version:row.retention_version+1};
  const result=await bindings.DB.prepare("UPDATE bills SET last_activity_at = ?1, all_paid_at = ?2, expires_at = ?3, retention_version = retention_version + 1 WHERE id = ?4 AND payload_json = ?5 AND share_token_digest = ?6 AND retention_version = ?7 AND expires_at IS NULL")
    .bind(initialized.last_activity_at,initialized.all_paid_at,initialized.expires_at,row.id,row.payload_json,row.share_token_digest,row.retention_version).run();
  return result.meta.changes===1?initialized:null;
}
export async function backfillLegacyBatch(bindings:RetentionBindings,limit:number):Promise<number>{
  const bounded=Math.max(0,Math.min(20,Math.floor(limit)));if(!bounded)return 0;
  const rolloutAt=await retentionRolloutAt(bindings);
  const rows=await bindings.DB.prepare("SELECT "+BILL_COLUMNS+" FROM bills WHERE expires_at IS NULL ORDER BY id LIMIT ?1").bind(bounded).all<StoredBillRow>();
  let changed=0;for(const row of rows.results)if(await initializeLegacyRow(bindings,row,rolloutAt))changed++;
  return changed;
}
