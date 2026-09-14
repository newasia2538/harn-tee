import { createBillRecord } from "../../../db/repository";
import { validateBillDraft } from "../../../lib/harn-tee/validation";
import type { BillDraft } from "../../../lib/harn-tee/types";

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, {
    headers: { "Cache-Control": "no-store" },
    ...init,
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as BillDraft & { draft?: boolean };
    const draft = body;
    if (!body.draft) {
      const validation = validateBillDraft(draft);
      if (!validation.valid) {
        return json({ errors: validation.errors }, { status: 400 });
      }
    }

    const record = await createBillRecord(draft, body.draft ? "draft" : "published");
    return json({
      id: record.id,
      shareToken: record.shareToken,
      editToken: record.editToken,
      document: record.document,
    });
  } catch (error) {
    console.error("Failed to create bill", error);
    return json({ error: "สร้างบิลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
