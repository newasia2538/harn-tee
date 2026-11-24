import {syncBillHistory} from "../../../../db/repository";
import {historyBody} from "../../../../lib/harn-tee/history-http";
import {draftJson,withDraftErrors} from "../../../../lib/harn-tee/draft-http";
export async function POST(request:Request){return withDraftErrors(async()=>{
  const {entries}=await historyBody(request);return draftJson(await syncBillHistory(entries));
});}
