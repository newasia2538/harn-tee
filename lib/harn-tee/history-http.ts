import {z} from "zod";
import {readJsonBody} from "./request-body";
import {DraftRequestError} from "./draft-http";
const capability=z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
const historySchema=z.object({entries:z.array(z.object({localId:capability,editToken:capability,shareToken:capability.optional()}).strict()).max(20)}).strict();
export async function historyBody(request:Request){
  const parsed=historySchema.safeParse(await readJsonBody(request,65536));
  if(!parsed.success)throw new DraftRequestError(400,"invalid-input");return parsed.data;
}
export async function maintenanceBody(request:Request){
  if(!z.object({}).strict().safeParse(await readJsonBody(request,1024)).success)throw new DraftRequestError(400,"invalid-input");
}
