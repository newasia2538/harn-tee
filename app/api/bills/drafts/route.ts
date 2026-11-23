import {createDraftOnce} from "../../../../db/repository";
import {sanitizeDraftForm} from "../../../../lib/harn-tee/draft-state";
import {createDraftRequestSchema,draftBody,draftJson,withDraftErrors} from "../../../../lib/harn-tee/draft-http";
export async function POST(request:Request){return withDraftErrors(async()=>{
  const body=await draftBody(request,createDraftRequestSchema);
  const result=await createDraftOnce(body.creationKey,sanitizeDraftForm(body.form));
  return draftJson(result,200,result.revision);
});}
