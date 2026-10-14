"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Check, ChevronRight, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ParticipantDetail } from "@/components/harn-tee/participant-detail";
import { PaymentSummary } from "@/components/harn-tee/payment-summary";
import { calculateBill, formatBaht } from "@/lib/harn-tee/money";
import type { BillDocument, ParticipantDraft } from "@/lib/harn-tee/types";

function getCalculation(document: BillDocument) {
  const participants: ParticipantDraft[] = document.participants.map((person) => ({
    id: person.id,
    name: person.name,
    order: person.order,
  }));
  return calculateBill({
    title: document.title,
    feeMode: document.feeMode ?? "bill",
    calculationMode: document.calculationMode ?? "vat-after-service",
    participants,
    items: document.items,
    vatPercent: document.vatPercent,
    serviceChargePercent: document.serviceChargePercent,
  });
}

function Brand() {
  return (
    <Link href="/" className="inline-flex items-center gap-2.5 text-[#1c4036]">
      <Image src="/harn-tee-icon.png" alt="หารที" width={48} height={48} className="h-11 w-11 rounded-2xl object-cover shadow-[0_8px_18px_rgb(23_63_53/16%)]" />
      <span className="font-display text-2xl font-bold tracking-[-0.04em]">harn-tee</span>
    </Link>
  );
}

export function SummaryClient({ token }: { token: string }) {
  const [document, setDocument] = useState<BillDocument | null>(null);
  const [qrAvailable, setQrAvailable] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/bills/" + token, { cache: "no-store" });
      const body = await response.json() as { access?: "share" | "edit"; document?: BillDocument; payment?: { qrAvailable?: boolean }; error?: string };
      if (!response.ok || !body.document) throw new Error(body.error ?? "ไม่พบข้อมูลบิลนี้");
      setDocument(body.document);
      setQrAvailable(body.payment?.qrAvailable === true);
      setCanManage(body.access === "edit");
      setLastUpdated(Date.now());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "โหลดบิลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [token]);
  // The fetch synchronizes this client view with a durable server record.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const calculation = useMemo(() => document ? getCalculation(document) : null, [document]);
  if (loading) return <main className="grid min-h-screen place-items-center p-6 text-[#315f50]">กำลังโหลดบิล...</main>;
  if (!document || error) return <main className="mx-auto grid min-h-screen max-w-lg place-items-center p-6 text-center"><div><TriangleAlert className="mx-auto text-[#e87553]" size={34} /><h1 className="mt-4 font-display text-3xl text-[#1c4036]">{error || "ไม่พบข้อมูลบิลนี้"}</h1><Button asChild className="mt-5 rounded-xl bg-[#2f7256] hover:bg-[#265d48]"><Link href="/">สร้างบิลใหม่</Link></Button></div></main>;

  const togglePaid = async (participantId: string, paid: boolean) => {
    setUpdating(participantId);
    const response = await fetch("/api/bills/" + token + "/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantId, paid }),
    });
    const body = await response.json() as { participants?: BillDocument["participants"] };
    if (response.ok && body.participants) {
      setDocument((current) => current ? { ...current, participants: body.participants! } : current);
    }
    setUpdating(null);
  };

  return (
    <main className="min-h-screen px-4 pb-12 pt-5 sm:px-6 sm:pt-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex items-center justify-between gap-4"><Brand /><Button variant="ghost" onClick={load} className="rounded-xl text-[#537166] hover:bg-[#eaf3e8]"><RefreshCw size={16} /> รีเฟรช</Button></header>
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-sm font-semibold text-[#7a9184]">สรุปบิล</p><h1 className="mt-1 font-display text-[clamp(2.2rem,6vw,4rem)] leading-none tracking-[-0.05em] text-[#1c4036]">{document.title || "บิลหารกับเพื่อน"}</h1><p className="mt-3 text-sm text-[#6d8176]">อัปเดตล่าสุด {lastUpdated ? new Date(lastUpdated).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) : "-"}</p></div>
          <Badge className="bg-[#eaf3e8] text-[#35644f] hover:bg-[#eaf3e8]">แชร์ลิงก์นี้ให้เพื่อนได้</Badge>
        </div>
        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="border-[#dfe8df] bg-white/85 shadow-[0_22px_60px_rgb(32_67_56/7%)]">
            <CardHeader className="space-y-1"><CardTitle className="font-display text-2xl text-[#1c4036]">ใครต้องจ่ายเท่าไหร่</CardTitle><p className="text-sm text-[#6d8176]">กดที่ชื่อเพื่อดูว่าสินค้าไหนอยู่ในยอดนั้น</p></CardHeader>
            <CardContent className="space-y-3">
              {calculation?.participants.map((person) => {
                const source = document.participants.find((entry) => entry.id === person.participantId);
                const paid = source?.paid ?? false;
                return (
                  <div className="rounded-2xl border border-[#e2ebe1] bg-[#fbfdf9] p-4" key={person.participantId}>
                    <button type="button" onClick={() => setSelectedPerson(person.participantId)} className="flex w-full items-center justify-between gap-3 text-left">
                      <span><span className="block text-base font-bold text-[#315f50]">{person.name}</span><span className="mt-1 block text-xs text-[#809087]">{person.lineItems.length} รายการ · ดูรายละเอียด</span></span>
                      <span className="flex items-center gap-2"><span className="font-display text-2xl text-[#1c4036]">{formatBaht(person.amountDueSatang)} <span className="font-sans text-xs text-[#7c9085]">บาท</span></span><ChevronRight size={17} className="text-[#97aa9e]" /></span>
                    </button>
                    <div className="mt-3 flex items-center justify-between gap-3 border-t border-[#e4ece2] pt-3">
                      <span className={paid ? "inline-flex items-center gap-1.5 text-xs font-bold text-[#3d8060]" : "text-xs font-semibold text-[#8a9a90]"}>{paid ? <><Check size={14} /> จ่ายแล้ว</> : "ยังไม่ได้จ่าย"}</span>
                      <Button size="sm" variant={paid ? "outline" : "default"} disabled={updating === person.participantId} onClick={() => void togglePaid(person.participantId, !paid)} className={paid ? "h-9 rounded-xl border-[#cbdccf] text-[#315f50]" : "h-9 rounded-xl bg-[#2f7256] hover:bg-[#265d48]"}>{paid ? "เปลี่ยนเป็นยังไม่จ่าย" : "ฉันจ่ายแล้ว"}</Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
          <div className="space-y-5">
            <Card className="border-0 bg-[#173f35] text-white shadow-[0_22px_60px_rgb(23_63_53/20%)]">
              <CardContent className="p-6"><p className="text-sm text-[#b9d8c3]">ยอดตามใบเสร็จ</p><p className="mt-1 font-display text-5xl">{formatBaht(calculation?.grossTotalSatang ?? 0)} <span className="font-sans text-base font-medium text-[#c5ded0]">บาท</span></p><div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/15 pt-4 text-sm"><div><span className="text-[#b9d8c3]">ยอดที่เรียกเก็บ</span><strong className="mt-1 block">{formatBaht(calculation?.collectedTotalSatang ?? 0)} บาท</strong></div><div><span className="text-[#b9d8c3]">ปัดขึ้นเพิ่ม</span><strong className="mt-1 block text-[#ffd1bd]">+{formatBaht(calculation?.roundingDifferenceSatang ?? 0)} บาท</strong></div></div></CardContent>
            </Card>
            <PaymentSummary key={document.updatedAt} document={document} token={token} qrAvailable={qrAvailable} canManage={canManage} />
            <p className="rounded-xl bg-[#fff8ed] px-4 py-3 text-xs leading-5 text-[#956c4d]">การหารอาจมีการปัดเศษขึ้นในกรณีที่หารกันไม่ลงตัว</p>
          </div>
        </div>
      </div>
      {selectedPerson ? (() => {
        const person = calculation?.participants.find((entry) => entry.participantId === selectedPerson);
        return person ? <ParticipantDetail person={person} onClose={() => setSelectedPerson(null)} /> : null;
      })() : null}
    </main>
  );
}
