import { setParticipantPaid } from "../../../../../db/repository";

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
  const { token } = await context.params;
  try {
    const body = (await request.json()) as {
      participantId?: string;
      paid?: boolean;
    };
    if (!body.participantId || typeof body.paid !== "boolean") {
      return json({ error: "ข้อมูลสถานะไม่ครบถ้วน" }, { status: 400 });
    }

    const document = await setParticipantPaid(
      token,
      body.participantId,
      body.paid,
    );
    if (!document) return json({ error: "ไม่พบข้อมูลบิลนี้" }, { status: 404 });
    return json({ document });
  } catch (error) {
    console.error("Failed to update payment status", error);
    return json({ error: "อัปเดตสถานะไม่สำเร็จ" }, { status: 500 });
  }
}
