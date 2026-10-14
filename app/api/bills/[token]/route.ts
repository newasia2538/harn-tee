import {
  deleteBillByEditToken,
  readBillByToken,
  updateBillByEditToken,
} from "../../../../db/repository";
import { validateBillDraft } from "../../../../lib/harn-tee/validation";
import { validateRecipient } from "../../../../lib/harn-tee/validation";
import { maskSensitiveValue } from "../../../../lib/harn-tee/privacy";
import { billPatchBodySchema } from "../../../../lib/harn-tee/server-validation";
import {
  InvalidJsonBodyError,
  readJsonBody,
  RequestBodyTooLargeError,
} from "../../../../lib/harn-tee/request-body";
import type { BillDocument, BillDraft, BillPatch } from "../../../../lib/harn-tee/types";

const MAX_JSON_BYTES = 1024 * 1024;

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, {
    headers: { "Cache-Control": "no-store" },
    ...init,
  });
}

function visibleDocument(document: BillDocument, access: "share" | "edit"): BillDocument {
  if (access === "edit") return document;
  const recipient = document.recipient;
  if (recipient.visible !== false) {
    return {
      ...document,
      recipient: {
        ...recipient,
        bank: recipient.bank
          ? { ...recipient.bank, accountNumber: maskSensitiveValue(recipient.bank.accountNumber) }
          : null,
        promptPay: recipient.promptPay
          ? { ...recipient.promptPay, value: maskSensitiveValue(recipient.promptPay.value) }
          : null,
        qr: null,
      },
    };
  }
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
    payment: {
      qrAvailable:
        (record.access === "edit" || record.document.recipient.visible !== false) &&
        Boolean(record.document.recipient.qr),
    },
    document: visibleDocument(record.document, record.access),
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  try {
    const body = await readJsonBody(request, MAX_JSON_BYTES);
    const parsed = billPatchBodySchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: "ข้อมูลที่ส่งมาแก้ไขไม่ถูกต้องหรือมีขนาดเกินกำหนด" }, { status: 400 });
    }
    const patch = parsed.data as BillPatch;
    const current = await readBillByToken("edit", token);
    if (!current) return json({ error: "ลิงก์แก้ไขไม่ถูกต้อง" }, { status: 404 });
    if (
      patch.recipient?.qr !== undefined &&
      JSON.stringify(patch.recipient.qr) !== JSON.stringify(current.document.recipient.qr)
    ) {
      return json({ error: "ไม่อนุญาตให้แก้ไขไฟล์ QR ผ่านข้อมูลบิล" }, { status: 400 });
    }
    const normalizedPatch: BillPatch = {
      ...patch,
      ...(patch.participants
        ? {
            participants: patch.participants.map((person) => ({
              id: person.id,
              name: person.name,
              order: person.order,
              paid: person.paid ?? false,
              paidAt: person.paidAt ?? null,
            })),
          }
        : {}),
      ...(patch.recipient
        ? { recipient: { ...patch.recipient, qr: current.document.recipient.qr } }
        : {}),
    };
    const draft: BillDraft = {
      title: normalizedPatch.title ?? current.document.title,
      feeMode: normalizedPatch.feeMode ?? current.document.feeMode ?? "bill",
      calculationMode:
        normalizedPatch.calculationMode ??
        current.document.calculationMode ??
        "vat-after-service",
      participants: (normalizedPatch.participants ?? current.document.participants).map(
        ({ id, name, order }) => ({ id, name, order }),
      ),
      items: normalizedPatch.items ?? current.document.items,
      vatPercent: normalizedPatch.vatPercent ?? current.document.vatPercent,
      serviceChargePercent:
        normalizedPatch.serviceChargePercent ?? current.document.serviceChargePercent,
      recipient: normalizedPatch.recipient ?? current.document.recipient,
    };
    const validation = validateBillDraft(draft);
    if (!validation.valid) {
      return json({ errors: validation.errors }, { status: 400 });
    }
    const paymentValidation = validateRecipient(draft.recipient, true);
    const paymentErrors = paymentValidation.valid
      ? []
      : paymentValidation.errors.filter((error) => error !== "ต้องมีช่องทางรับเงินอย่างน้อย 1 ช่องทาง");
    if (paymentErrors.length > 0) return json({ errors: paymentErrors }, { status: 400 });

    const document = await updateBillByEditToken(token, normalizedPatch);
    if (!document) return json({ error: "ลิงก์แก้ไขไม่ถูกต้อง" }, { status: 404 });
    return json({ document });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return json({ error: "ข้อมูลที่ส่งมาแก้ไขมีขนาดใหญ่เกินไป" }, { status: 413 });
    }
    if (error instanceof InvalidJsonBodyError) {
      return json({ error: "รูปแบบข้อมูลที่ส่งมาแก้ไขไม่ถูกต้อง" }, { status: 400 });
    }
    console.error("Failed to update bill", error);
    return json({ error: "บันทึกบิลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  try {
    const deleted = await deleteBillByEditToken(token);
    if (!deleted) return json({ error: "ลิงก์แก้ไขไม่ถูกต้อง" }, { status: 404 });
    return json({ deleted: true });
  } catch (error) {
    console.error("Failed to delete bill", error);
    return json({ error: "ลบบิลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
