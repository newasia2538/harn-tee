import { setParticipantPaid } from "../../../../../db/repository";
import {requiredRevision,withDraftErrors,draftJson} from "../../../../../lib/harn-tee/draft-http";
import { paymentStatusBodySchema } from "../../../../../lib/harn-tee/server-validation";
import {
  InvalidJsonBodyError,
  readJsonBody,
  RequestBodyTooLargeError,
} from "../../../../../lib/harn-tee/request-body";

const MAX_STATUS_JSON_BYTES = 4096;

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, {
    headers: { "Cache-Control": "no-store" },
    ...init,
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  if(request.headers.has("If-Match"))return withDraftErrors(async()=>{
    const {token}=await context.params,revision=requiredRevision(request);
    const parsed=paymentStatusBodySchema.safeParse(await readJsonBody(request,MAX_STATUS_JSON_BYTES));
    if(!parsed.success)return draftJson({error:"ข้อมูลสถานะไม่ครบถ้วน"},400);
    const ack=await setParticipantPaid(token,parsed.data.participantId,parsed.data.paid,revision);
    return ack?draftJson({participants:ack.document.participants,revision:ack.revision},200,ack.revision):draftJson({error:"ไม่พบข้อมูลบิลนี้"},404);
  });
  const { token } = await context.params;
  try {
    const rawBody = await readJsonBody(request, MAX_STATUS_JSON_BYTES);
    const parsed = paymentStatusBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return json({ error: "ข้อมูลสถานะไม่ครบถ้วน" }, { status: 400 });
    }

    const document = await setParticipantPaid(
      token,
      parsed.data.participantId,
      parsed.data.paid,
    );
    if (!document) return json({ error: "ไม่พบข้อมูลบิลนี้" }, { status: 404 });
    return json({ participants: document.participants });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return json({ error: "ข้อมูลสถานะมีขนาดใหญ่เกินไป" }, { status: 413 });
    }
    if (error instanceof InvalidJsonBodyError) {
      return json({ error: "รูปแบบข้อมูลสถานะไม่ถูกต้อง" }, { status: 400 });
    }
    if(error instanceof Error&&error.message==="revision-conflict")return json({error:"ข้อมูลบิลเปลี่ยนแล้ว กรุณาลองใหม่",code:"revision-conflict"},{status:409});
    console.error("Failed to update payment status", error);
    return json({ error: "อัปเดตสถานะไม่สำเร็จ" }, { status: 500 });
  }
}
