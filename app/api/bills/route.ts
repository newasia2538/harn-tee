import { createBillRecord } from "../../../db/repository";
import { validateBillDraft } from "../../../lib/harn-tee/validation";
import { validateRecipient } from "../../../lib/harn-tee/validation";
import { billCreateBodySchema } from "../../../lib/harn-tee/server-validation";
import {
  InvalidJsonBodyError,
  readJsonBody,
  RequestBodyTooLargeError,
} from "../../../lib/harn-tee/request-body";

const MAX_JSON_BYTES = 1024 * 1024;

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, {
    headers: { "Cache-Control": "no-store" },
    ...init,
  });
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request, MAX_JSON_BYTES);
    const parsed = billCreateBodySchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: "ข้อมูลบิลไม่ถูกต้องหรือมีขนาดเกินกำหนด" }, { status: 400 });
    }
    const { draft: isDraft, ...inputDraft } = parsed.data;
    const draft = {
      ...inputDraft,
      recipient: inputDraft.recipient
        ? { ...inputDraft.recipient, qr: null }
        : undefined,
    };

    if (!isDraft) {
      const validation = validateBillDraft(draft);
      if (!validation.valid) {
        return json({ errors: validation.errors }, { status: 400 });
      }
      const paymentValidation = validateRecipient(draft.recipient, true);
      const paymentErrors = paymentValidation.valid
        ? []
        : paymentValidation.errors.filter((error) => error !== "ต้องมีช่องทางรับเงินอย่างน้อย 1 ช่องทาง");
      if (paymentErrors.length > 0) return json({ errors: paymentErrors }, { status: 400 });
    }

    const record = await createBillRecord(draft, isDraft ? "draft" : "published");
    return json({
      id: record.id,
      shareToken: record.shareToken,
      editToken: record.editToken,
      document: record.document,
    });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return json({ error: "ข้อมูลบิลมีขนาดใหญ่เกินไป" }, { status: 413 });
    }
    if (error instanceof InvalidJsonBodyError) {
      return json({ error: "รูปแบบข้อมูลบิลไม่ถูกต้อง" }, { status: 400 });
    }
    console.error("Failed to create bill", error);
    return json({ error: "สร้างบิลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
