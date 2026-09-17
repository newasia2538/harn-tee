"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Clipboard, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Stepper } from "@/components/harn-tee/stepper";
import { ParticipantEditor } from "@/components/harn-tee/participant-editor";
import { ItemEditor } from "@/components/harn-tee/item-editor";
import { FeeEditor } from "@/components/harn-tee/fee-editor";
import { PaymentEditor } from "@/components/harn-tee/payment-editor";
import { LinkPanel } from "@/components/harn-tee/link-panel";
import { CopyButton } from "@/components/harn-tee/copy-button";
import { ParticipantDetail } from "@/components/harn-tee/participant-detail";
import { calculateBill, formatBaht } from "@/lib/harn-tee/money";
import { validateBillDraft, validateRecipient } from "@/lib/harn-tee/validation";
import type {
  BillDocument,
  BillDraft,
  CalculationMode,
  FeeMode,
  RecipientData,
} from "@/lib/harn-tee/types";
import { registerHarnTeeTools } from "@/lib/harn-tee/webmcp";

function makeId(prefix: string) {
  return prefix + "-" + Math.random().toString(36).slice(2, 10);
}

function emptyRecipient(): RecipientData {
  return { name: "", bank: null, promptPay: null, qr: null, visible: true };
}

function defaultDraft(): BillDraft {
  const firstPerson = makeId("person");
  return {
    title: "",
    feeMode: "bill",
    calculationMode: "vat-after-service",
    participants: [{ id: firstPerson, name: "", order: 0 }],
    items: [{ id: makeId("item"), name: "", priceSatang: 0, payerIds: [firstPerson], order: 0 }],
    vatPercent: 0,
    serviceChargePercent: 0,
    recipient: emptyRecipient(),
  };
}

function documentToDraft(document: BillDocument): BillDraft {
  return {
    title: document.title,
    feeMode: document.feeMode ?? "bill",
    calculationMode: document.calculationMode ?? "vat-after-service",
    participants: document.participants.map((person) => ({
      id: person.id,
      name: person.name,
      order: person.order,
    })),
    items: document.items,
    vatPercent: document.vatPercent,
    serviceChargePercent: document.serviceChargePercent,
    recipient: document.recipient,
  };
}

function BrandMark() {
  return (
    <Link href="/" className="inline-flex items-center gap-2.5 text-[#1c4036]">
      <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#ef6c4d] text-white shadow-[0_8px_18px_rgb(239_108_77/22%)]">
        <span className="font-display text-2xl font-bold leading-none">÷</span>
      </span>
      <span>
        <span className="block font-display text-2xl font-bold leading-none tracking-[-0.04em]">harn-tee</span>
        <span className="mt-0.5 block text-[11px] font-semibold tracking-[0.08em] text-[#7a9184]">หารที</span>
      </span>
    </Link>
  );
}

export function HarnTeeApp({ initialDocument, editToken }: { initialDocument?: BillDocument; editToken?: string }) {
  const isEditMode = Boolean(editToken);
  const [draft, setDraft] = useState<BillDraft>(() => initialDocument ? documentToDraft(initialDocument) : defaultDraft());
  const [draftEditToken, setDraftEditToken] = useState(editToken ?? "");
  const [draftShareToken, setDraftShareToken] = useState("");
  const [step, setStep] = useState(0);
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [links, setLinks] = useState<{ shareUrl: string; editUrl: string } | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);
  const [paidState, setPaidState] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(initialDocument?.participants.map((person) => [person.id, person.paid]) ?? []),
  );
  const calculation = useMemo(() => calculateBill(draft), [draft]);
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => registerHarnTeeTools({
    getDraft: () => draftRef.current,
    start: () => setStep(0),
    addItem: (item) => setDraft((current) => ({ ...current, items: [...current.items, item] })),
  }), []);

  const addParticipant = () => {
    const id = makeId("person");
    setDraft((current) => ({
      ...current,
      participants: [...current.participants, { id, name: "", order: current.participants.length }],
      items: current.items.map((item) => ({ ...item, payerIds: [...item.payerIds, id] })),
    }));
  };

  const removeParticipant = (id: string) => {
    setDraft((current) => ({
      ...current,
      participants: current.participants.filter((person) => person.id !== id).map((person, index) => ({ ...person, order: index })),
      items: current.items.map((item) => ({ ...item, payerIds: item.payerIds.filter((payerId) => payerId !== id) })),
    }));
  };

  const addItem = () => setDraft((current) => ({
    ...current,
    items: [...current.items, {
      id: makeId("item"),
      name: "",
      priceSatang: 0,
      payerIds: current.participants.map((person) => person.id),
      order: current.items.length,
    }],
  }));

  const removeItem = (id: string) => setDraft((current) => ({
    ...current,
    items: current.items.filter((item) => item.id !== id).map((item, index) => ({ ...item, order: index })),
  }));

  const updateItem = (id: string, patch: Partial<BillDraft["items"][number]>) => setDraft((current) => ({
    ...current,
    items: current.items.map((item) => item.id === id ? { ...item, ...patch } : item),
  }));

  const ensureDraftToken = async () => {
    if (isEditMode || draftEditToken) return;
    setSaving(true);
    try {
      const response = await fetch("/api/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, draft: true }),
      });
      const body = await response.json() as { error?: string; shareToken?: string; editToken?: string };
      if (!response.ok || !body.editToken || !body.shareToken) {
        throw new Error(body.error ?? "สร้างลิงก์แก้ไขไม่สำเร็จ");
      }
      setDraftEditToken(body.editToken);
      setDraftShareToken(body.shareToken);
    } finally {
      setSaving(false);
    }
  };

  const nextStep = async () => {
    setError("");
    if (step === 0) {
      const names = draft.participants.map((person) => person.name.trim().toLocaleLowerCase());
      if (names.some((name) => !name)) return setError("กรอกชื่อทุกคนก่อนนะ");
      if (new Set(names).size !== names.length) return setError("ชื่อคนในบิลต้องไม่ซ้ำกัน");
    }
    if (step === 1) {
      const validation = validateBillDraft(draft);
      if (!validation.valid) return setError(validation.errors[0]);
      const paymentValidation = validateRecipient(draft.recipient, Boolean(qrFile));
      if (!paymentValidation.valid) return setError(paymentValidation.errors[0]);
    }
    if (step === 0) {
      try {
        await ensureDraftToken();
        setStep(1);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "สร้างลิงก์แก้ไขไม่สำเร็จ");
      }
      return;
    }
    setStep((current) => Math.min(2, current + 1));
  };

  const saveBill = async () => {
    setError("");
    const validation = validateBillDraft(draft);
    if (!validation.valid) return setError(validation.errors[0]);
    setSaving(true);
    try {
      const activeEditToken = editToken ?? draftEditToken;
      const hasExistingDraft = Boolean(activeEditToken);
      const response = await fetch(hasExistingDraft ? "/api/bills/" + activeEditToken : "/api/bills", {
        method: hasExistingDraft ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(hasExistingDraft ? { ...draft, status: "published" } : draft),
      });
      const body = await response.json() as { error?: string; shareToken?: string; editToken?: string };
      if (!response.ok) throw new Error(body.error ?? "บันทึกไม่สำเร็จ");

      const returnedEditToken = activeEditToken ?? body.editToken;
      if (qrFile && returnedEditToken) {
        const formData = new FormData();
        formData.append("file", qrFile);
        const qrResponse = await fetch("/api/bills/" + returnedEditToken + "/qr", { method: "POST", body: formData });
        if (!qrResponse.ok) throw new Error("อัปโหลด QR ไม่สำเร็จ");
      }

      if (isEditMode) {
        setPaidState(Object.fromEntries(draft.participants.map((person) => [person.id, false])));
        setSaved(true);
      } else if (hasExistingDraft && draftShareToken) {
        setLinks({
          shareUrl: window.location.origin + "/share/" + draftShareToken,
          editUrl: window.location.origin + "/edit/" + activeEditToken,
        });
      } else if (body.shareToken && body.editToken) {
        setLinks({
          shareUrl: window.location.origin + "/share/" + body.shareToken,
          editUrl: window.location.origin + "/edit/" + body.editToken,
        });
      } else {
        throw new Error("สร้างลิงก์ไม่สำเร็จ");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "บันทึกไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setSaving(false);
    }
  };

  const toggleAdminPaid = async (participantId: string) => {
    if (!editToken) return;
    const nextPaid = !paidState[participantId];
    const response = await fetch("/api/bills/" + editToken + "/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantId, paid: nextPaid }),
    });
    if (response.ok) setPaidState((current) => ({ ...current, [participantId]: nextPaid }));
  };

  if (links) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-14">
        <BrandMark />
        <div className="mt-10"><LinkPanel shareUrl={links.shareUrl} editUrl={links.editUrl} /></div>
      </div>
    );
  }

  return (
    <main className="min-h-screen px-4 pb-12 pt-5 sm:px-6 sm:pt-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex items-center justify-between gap-4">
          <BrandMark />
          <div className="hidden items-center gap-2 text-xs font-semibold text-[#789085] sm:flex">
            <Sparkles size={15} className="text-[#e77b57]" />
            ช่วยหารบิลที่เราจ่ายกันไป
          </div>
        </header>

        <div className="mx-auto max-w-3xl">
          <div className="mb-8">
            <h1 className="font-display text-[clamp(2.3rem,7vw,4.5rem)] leading-[0.98] tracking-[-0.055em] text-[#1c4036]">
              หารที <span className="text-[#e87553]">ไม่ต้องเดา</span>
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-[#61766b] sm:text-lg">
              ใส่ของที่กิน ใครจ่ายอะไร แล้วแชร์ยอดที่ชัดเจนให้เพื่อนในไม่กี่ขั้น
            </p>
          </div>
          <Stepper current={step} />
          {draftEditToken && !isEditMode ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#eadfd2] bg-[#fffaf4] px-4 py-3 text-sm text-[#8d6d59]">
              <span>ลิงก์แก้ไขถูกสร้างแล้ว เก็บไว้ก่อนกรอกต่อได้เลย</span>
              <CopyButton value={window.location.origin + "/edit/" + draftEditToken} label="คัดลอกลิงก์แก้ไข" />
            </div>
          ) : null}

          <div className="mt-6 space-y-5">
            {step === 0 ? (
              <>
                <Card className="border-[#dfe8df] bg-white/85 shadow-[0_22px_60px_rgb(32_67_56/7%)]">
                  <CardContent className="space-y-2 p-5">
                    <label className="block space-y-1.5">
                      <span className="text-sm font-semibold text-[#4d665b]">ชื่อบิล (ใส่หรือไม่ก็ได้)</span>
                      <Input
                        value={draft.title ?? ""}
                        onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                        placeholder="เช่น ข้าวเย็นทีม Design"
                        className="h-12 rounded-xl border-[#dfe8df] bg-[#fbfdf9] text-base"
                      />
                    </label>
                  </CardContent>
                </Card>
                <ParticipantEditor
                  title="ใครอยู่ในบิลนี้บ้าง?"
                  participants={draft.participants}
                  onChange={(id, name) => setDraft((current) => ({
                    ...current,
                    participants: current.participants.map((person) => person.id === id ? { ...person, name } : person),
                  }))}
                  onAdd={addParticipant}
                  onRemove={removeParticipant}
                />
              </>
            ) : null}

            {step === 1 ? (
              <>
                <ItemEditor items={draft.items} participants={draft.participants} feeMode={draft.feeMode ?? "bill"} onChange={updateItem} onAdd={addItem} onRemove={removeItem} />
                <FeeEditor
                  vatPercent={draft.vatPercent}
                  serviceChargePercent={draft.serviceChargePercent}
                  feeMode={draft.feeMode ?? "bill"}
                  calculationMode={draft.calculationMode ?? "vat-after-service"}
                  onModeChange={(feeMode: FeeMode) => setDraft((current) => ({ ...current, feeMode }))}
                  onCalculationModeChange={(calculationMode: CalculationMode) =>
                    setDraft((current) => ({ ...current, calculationMode }))
                  }
                  onChange={(key, value) => setDraft((current) => ({ ...current, [key]: value }))}
                />
                <PaymentEditor
                  recipient={draft.recipient ?? emptyRecipient()}
                  qrFile={qrFile}
                  onChange={(recipient) => setDraft((current) => ({ ...current, recipient }))}
                  onQrChange={setQrFile}
                />
              </>
            ) : null}

            {step === 2 ? (
              <Card className="border-[#dfe8df] bg-white/85 shadow-[0_22px_60px_rgb(32_67_56/7%)]">
                <CardHeader className="space-y-1">
                  <div className="mb-1 grid h-11 w-11 place-items-center rounded-2xl bg-[#eaf3e8] text-[#2e6655]"><Clipboard size={21} /></div>
                  <CardTitle className="font-display text-2xl text-[#1c4036]">ตรวจสอบก่อนแชร์</CardTitle>
                  <p className="text-sm text-[#6d8176]">เช็กให้ครบอีกครั้ง แล้วสร้างลิงก์สรุปให้เพื่อน</p>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="rounded-2xl bg-[#173f35] p-5 text-white">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm text-[#b9d8c3]">ยอดตามใบเสร็จ</p>
                        <p className="mt-1 font-display text-4xl">{formatBaht(calculation.grossTotalSatang)} <span className="text-base font-sans font-medium text-[#c5ded0]">บาท</span></p>
                      </div>
                      <Badge className="bg-[#e87553] text-white hover:bg-[#e87553]">{draft.participants.length} คน</Badge>
                    </div>
                    <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/15 pt-4 text-sm">
                      <div><span className="text-[#b9d8c3]">สินค้า</span><strong className="mt-1 block">{formatBaht(calculation.subtotalSatang)} บาท</strong></div>
                      <div><span className="text-[#b9d8c3]">ปัดขึ้นรวม</span><strong className="mt-1 block text-[#ffd1bd]">+{formatBaht(calculation.roundingDifferenceSatang)} บาท</strong></div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {calculation.participants.map((person) => (
                      <div className="rounded-xl border border-[#d9e3ec] bg-white px-4 py-3" key={person.participantId}>
                        <button type="button" onClick={() => setSelectedPerson(person.participantId)} className="flex w-full items-center justify-between gap-3 text-left">
                          <span><span className="block font-semibold text-[#1f3b55]">{person.name}</span><span className="mt-1 block text-xs text-[#607387]">{person.lineItems.length} รายการ · ดูรายละเอียด</span></span>
                          <span className="font-display text-xl text-[#15263d]">{formatBaht(person.amountDueSatang)} <span className="font-sans text-xs text-[#607387]">บาท</span></span>
                        </button>
                        {isEditMode ? <button type="button" onClick={() => void toggleAdminPaid(person.participantId)} className="mt-2 text-xs font-bold text-[#185c74]">{paidState[person.participantId] ? "จ่ายแล้ว · เปลี่ยนเป็นยังไม่จ่าย" : "ยังไม่ได้จ่าย · กดเพื่อเปลี่ยน"}</button> : null}
                      </div>
                    ))}
                  </div>
                  <p className="rounded-xl bg-[#fff8ed] px-4 py-3 text-xs leading-5 text-[#956c4d]">
                    การหารอาจมีการปัดเศษขึ้นในกรณีที่หารกันไม่ลงตัว
                  </p>
                </CardContent>
              </Card>
            ) : null}

            {error ? <div className="rounded-xl border border-[#f1c5b7] bg-[#fff3ef] px-4 py-3 text-sm font-semibold text-[#b84d38]" role="alert">{error}</div> : null}

            <div className="flex items-center justify-between gap-3">
              {step > 0 ? (
                <Button type="button" variant="ghost" onClick={() => { setError(""); setStep((current) => current - 1); }} className="h-12 rounded-xl text-[#537166] hover:bg-[#eef7eb]">
                  <ArrowLeft size={17} /> ย้อนกลับ
                </Button>
              ) : <span />}
              {step < 2 ? (
                <Button type="button" onClick={nextStep} className="h-12 rounded-xl bg-[#ef6c4d] px-5 text-base font-bold text-white shadow-[0_9px_20px_rgb(239_108_77/22%)] hover:bg-[#d95c40]">
                  {step === 0 ? "ไปใส่รายการสินค้า" : "ตรวจสอบยอด"} <ArrowRight size={17} />
                </Button>
              ) : (
                <Button type="button" onClick={saveBill} disabled={saving} className="h-12 rounded-xl bg-[#2f7256] px-5 text-base font-bold text-white shadow-[0_9px_20px_rgb(47_114_86/22%)] hover:bg-[#265d48]">
                  {saving ? "กำลังบันทึก..." : isEditMode ? "บันทึกการแก้ไข" : "ยืนยันและสร้างลิงก์แชร์"} <Check size={17} />
                </Button>
              )}
            </div>
            {saved ? <div className="rounded-xl border border-[#bfdcc8] bg-[#eff9f0] px-4 py-3 text-sm font-semibold text-[#2f7256]">บันทึกการแก้ไขแล้ว ลองเปิด share link เพื่อดูผลล่าสุด</div> : null}
          </div>
        </div>
      </div>
      {selectedPerson ? (
        (() => {
          const person = calculation.participants.find((entry) => entry.participantId === selectedPerson);
          return person ? <ParticipantDetail person={person} onClose={() => setSelectedPerson(null)} /> : null;
        })()
      ) : null}
    </main>
  );
}
