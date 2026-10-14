import { readBillByToken } from "../../../../../db/repository";

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
    ...init,
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const field = new URL(request.url).searchParams.get("field");
  if (field !== "bank" && field !== "promptPay") {
    return json({ error: "ไม่รู้จักข้อมูลที่ต้องการเปิดดู" }, { status: 400 });
  }

  const { token } = await context.params;
  const share = await readBillByToken("share", token);
  const record = share ?? (await readBillByToken("edit", token));
  if (!record) return json({ error: "ไม่พบข้อมูลบิลนี้" }, { status: 404 });
  if (record.access === "share" && record.document.recipient.visible === false) {
    return json({ error: "เจ้าของบิลซ่อนข้อมูลรับเงินไว้" }, { status: 404 });
  }

  const value = field === "bank"
    ? record.document.recipient.bank?.accountNumber
    : record.document.recipient.promptPay?.value;
  if (!value) return json({ error: "ไม่พบข้อมูลที่ต้องการ" }, { status: 404 });

  return json({ value });
}
