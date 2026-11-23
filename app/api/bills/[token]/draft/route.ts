import {readEditCheckpoint,saveDraftCheckpoint} from "../../../../../db/repository";
import {sanitizeDraftForm} from "../../../../../lib/harn-tee/draft-state";
import {draftBody,draftJson,draftResult,requiredRevision,saveDraftRequestSchema,withDraftErrors} from "../../../../../lib/harn-tee/draft-http";
type Context={params:Promise<{token:string}>};
export async function GET(_request:Request,context:Context){return withDraftErrors(async()=>{
  const {token}=await context.params,result=await readEditCheckpoint(token);
  return result?draftJson(result,200,result.revision):draftJson({error:"ไม่พบข้อมูลบิลนี้"},404);
});}
export async function PUT(request:Request,context:Context){return withDraftErrors(async()=>{
  const {token}=await context.params;if(!await readEditCheckpoint(token))return draftJson({error:"ไม่พบข้อมูลบิลนี้"},404);
  const revision=requiredRevision(request),body=await draftBody(request,saveDraftRequestSchema);
  return draftResult(await saveDraftCheckpoint(token,revision,sanitizeDraftForm(body.form)));
});}
