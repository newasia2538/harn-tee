import {
  readQrByToken,
  saveQrForEditToken,
} from "../../../../../db/repository";

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
      "Cache-Control": "public, max-age=300",
      "Content-Type": object.httpMetadata?.contentType ?? "image/png",
      ...(object.httpEtag ? { ETag: object.httpEtag } : {}),
    },
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return json({ error: "กรุณาเลือกไฟล์ QR" }, { status: 400 });
  }
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    return json({ error: "รองรับเฉพาะไฟล์ PNG, JPG หรือ WebP" }, { status: 400 });
  }
  if (file.size > 5 * 1024 * 1024) {
    return json({ error: "ไฟล์ QR ต้องมีขนาดไม่เกิน 5 MB" }, { status: 400 });
  }

  const document = await saveQrForEditToken(token, file);
  if (!document) return json({ error: "ลิงก์แก้ไขไม่ถูกต้อง" }, { status: 404 });
  return json({ document });
}
