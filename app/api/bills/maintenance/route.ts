import {env} from "cloudflare:workers";
import {runBillMaintenance} from "../../../../db/bill-maintenance";
import {maintenanceBody} from "../../../../lib/harn-tee/history-http";
import {draftJson,withDraftErrors} from "../../../../lib/harn-tee/draft-http";
export async function POST(request:Request){return withDraftErrors(async()=>{
  await maintenanceBody(request);
  if(!env.DB)throw new Error("database-unavailable");
  await runBillMaintenance({DB:env.DB,BUCKET:env.BUCKET},Date.now());return draftJson({serverNow:Date.now()});
});}
