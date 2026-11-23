import {readEditCheckpoint,issueDraftShareCapability} from "../../../../../db/repository";
import {draftBody,draftJson,draftResult,emptyDraftRequestSchema,requiredRevision,withDraftErrors} from "../../../../../lib/harn-tee/draft-http";
export async function POST(request:Request,context:{params:Promise<{token:string}>}){return withDraftErrors(async()=>{
  const {token}=await context.params;if(!await readEditCheckpoint(token))return draftJson({error:"ไม่พบข้อมูลบิลนี้"},404);
  const revision=requiredRevision(request);await draftBody(request,emptyDraftRequestSchema);
  return draftResult(await issueDraftShareCapability(token,revision));
});}
