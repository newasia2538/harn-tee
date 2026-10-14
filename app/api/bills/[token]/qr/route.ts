import {
  readBillByToken,
  readQrByToken,
  saveQrForEditToken,
} from "../../../../../db/repository";
import { readFormDataBody, RequestBodyTooLargeError, InvalidFormDataBodyError } from "../../../../../lib/harn-tee/request-body";
import { hasValidQrImageSignature } from "../../../../../lib/harn-tee/qr-image";

const MAX_QR_FILE_BYTES = 5 * 1024 * 1024;
const MAX_QR_REQUEST_BYTES = 6 * 1024 * 1024;

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, {
    headers: { "Cache-Control": "no-store" },
    ...init,
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const object = await readQrByToken(token);
  if (!object) return json({ error: "ไม่พบ QR ของบิลนี้" }, { status: 404 });
  return new Response(object.body, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Type": object.httpMetadata?.contentType ?? "image/png",
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "same-origin",
      ...(object.httpEtag ? { ETag: object.httpEtag } : {}),
    },
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  if (!(await readBillByToken("edit", token))) {
    return json({ error: "ลิงก์แก้ไขไม่ถูกต้อง" }, { status: 404 });
  }
  let formData: FormData;
  try {
    formData = await readFormDataBody(request, MAX_QR_REQUEST_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return json({ error: "คำขออัปโหลดมีขนาดใหญ่เกินไป" }, { status: 413 });
    }
    if (error instanceof InvalidFormDataBodyError) {
      return json({ error: "รูปแบบไฟล์อัปโหลดไม่ถูกต้อง" }, { status: 400 });
    }
    throw error;
  }
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return json({ error: "กรุณาเลือกไฟล์ QR" }, { status: 400 });
  }
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    return json({ error: "รองรับเฉพาะไฟล์ PNG, JPG หรือ WebP" }, { status: 400 });
  }
  if (file.size > MAX_QR_FILE_BYTES) {
    return json({ error: "ไฟล์ QR ต้องมีขนาดไม่เกิน 5 MB" }, { status: 400 });
  }

  const fileBytes = await file.arrayBuffer();
  if (!hasValidQrImageSignature(file.type, new Uint8Array(fileBytes))) {
    return json({ error: "ชนิดไฟล์ไม่ตรงกับเนื้อหาภาพ" }, { status: 400 });
  }
  const verifiedFile = new File([fileBytes], file.name, { type: file.type });

  const document = await saveQrForEditToken(token, verifiedFile);
  if (!document) return json({ error: "ลิงก์แก้ไขไม่ถูกต้อง" }, { status: 404 });
  return json({ document });
}
