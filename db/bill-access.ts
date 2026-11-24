import {hashToken,tokensMatch} from "../lib/harn-tee/tokens";
import {BILL_COLUMNS,initializeLegacyRow,retentionRolloutAt,rowLifecycle,type RetentionBindings,type StoredBillRow} from "./bill-retention-store";

export class BillUnavailableError extends Error{
  constructor(public code:"bill-deleted"|"bill-deleting"){super(code);}
}
export type BillAccess={kind:"active";row:StoredBillRow}|{kind:"missing"}|{kind:"gone";state:"deleting"|"deleted"};
export async function lookupBillAccess(bindings:RetentionBindings,kind:"share"|"edit",rawToken:string,now:number):Promise<BillAccess>{
  const digest=await hashToken(rawToken),column=kind==="share"?"share_token_digest":"edit_token_digest";
  for(let attempt=0;attempt<3;attempt++){
    let row=await bindings.DB.prepare("SELECT "+BILL_COLUMNS+" FROM bills WHERE "+column+" = ?1 LIMIT 1").bind(digest).first<StoredBillRow>();
    if(!row){
      const marker=await bindings.DB.prepare("SELECT id, state, share_token_digest, edit_token_digest FROM bill_deletions WHERE "+column+" = ?1 LIMIT 1").bind(digest).first<{id:string;state:"deleting"|"deleted";share_token_digest:string;edit_token_digest:string}>();
      return marker&&await tokensMatch(rawToken,marker[column])?{kind:"gone",state:marker.state}:{kind:"missing"};
    }
    if(!await tokensMatch(rawToken,row[column]))return {kind:"missing"};
    if(row.expires_at===null){
      row=await initializeLegacyRow(bindings,row,await retentionRolloutAt(bindings));
      if(!row)continue;
    }
    if(rowLifecycle(row).expiresAt<=Math.max(now,Date.now()))return {kind:"gone",state:"deleting"};
    return {kind:"active",row};
  }
  throw new Error("bill-retention-read-conflict");
}
