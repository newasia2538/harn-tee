import {
  deleteBillByEditToken,
  readBillByToken,
  updateBillByEditToken,
} from "../../../../db/repository";
import { validateBillDraft } from "../../../../lib/harn-tee/validation";
import type { BillDraft, BillPatch } from "../../../../lib/harn-tee/types";

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, {
    headers: { "Cache-Control": "no-store" },
    ...init,
  });
}

function visibleDocument(document: Record<string, unknown>, access: "share" | "edit") {
  if (access === "edit") return document;
  const recipient = document.recipient as
    | { visible?: boolean; [key: string]: unknown }
    | undefined;
  if (recipient?.visible !== false) return document;
  return {
    ...document,
    recipient: {
      name: recipient.name ?? "",
      bank: null,
      promptPay: null,
      qr: null,
      visible: false,
    },
  };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const share = await readBillByToken("share", token);
  const record = share ?? (await readBillByToken("edit", token));
  if (!record) return json({ error: "ไม่พบข้อมูลบิลนี้" }, { status: 404 });

  return json({
    access: record.access,
    document: visibleDocument(
      record.document as unknown as Record<string, unknown>,
      record.access,
    ),
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  try {
    const patch = (await request.json()) as BillPatch;
    const current = await readBillByToken("edit", token);
    if (!current) return json({ error: "ลิงก์แก้ไขไม่ถูกต้อง" }, { status: 404 });
    const draft: BillDraft = {
      title: patch.title ?? current.document.title,
      participants: (patch.participants ?? current.document.participants).map(
        ({ id, name, order }) => ({ id, name, order }),
      ),
      items: patch.items ?? current.document.items,
      vatPercent: patch.vatPercent ?? current.document.vatPercent,
      serviceChargePercent:
        patch.serviceChargePercent ?? current.document.serviceChargePercent,
      recipient: patch.recipient ?? current.document.recipient,
    };
    const validation = validateBillDraft(draft);
    if (!validation.valid) {
      return json({ errors: validation.errors }, { status: 400 });
    }
    const document = await updateBillByEditToken(token, patch);
    if (!document) return json({ error: "ลิงก์แก้ไขไม่ถูกต้อง" }, { status: 404 });
    return json({ document });
  } catch (error) {
    console.error("Failed to update bill", error);
    return json({ error: "บันทึกบิลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const deleted = await deleteBillByEditToken(token);
  if (!deleted) return json({ error: "ลิงก์แก้ไขไม่ถูกต้อง" }, { status: 404 });
  return json({ deleted: true });
}
