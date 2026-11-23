import {readEditCheckpoint,publishCheckpoint} from "../../../../../db/repository";
import {draftBody,draftJson,draftResult,publishDraftRequestSchema,requiredRevision,withDraftErrors} from "../../../../../lib/harn-tee/draft-http";
export async function POST(request:Request,context:{params:Promise<{token:string}>}){return withDraftErrors(async()=>{
  const {token}=await context.params;if(!await readEditCheckpoint(token))return draftJson({error:"ไม่พบข้อมูลบิลนี้"},404);
  const revision=requiredRevision(request),body=await draftBody(request,publishDraftRequestSchema);
  return draftResult(await publishCheckpoint(token,revision,body.form,body.confirmationId,body.shareToken));
});}
