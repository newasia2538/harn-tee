"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import Image from "next/image";
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
import {DraftRecovery} from "@/components/harn-tee/draft-recovery";
import {DraftSaveStatus} from "@/components/harn-tee/draft-save-status";
import {LiveBillTotals} from "@/components/harn-tee/live-bill-totals";
import {useDraftSession} from "@/lib/harn-tee/use-draft-session";
import {setNumericInput,validateFormForPublication,type DraftAck,type NumericField} from "@/lib/harn-tee/draft-state";
import {createDraftApi,type DraftApi,DraftApiError} from "@/lib/harn-tee/draft-api";
import type {DraftStore} from "@/lib/harn-tee/draft-store";
import {confirmDraftPublication,RecoveryCopyRequiredError} from "@/lib/harn-tee/draft-publication";
import { calculateBill, formatBaht } from "@/lib/harn-tee/money";
import { appendReceiptItems, isReceiptItemReady } from "@/lib/harn-tee/receipt-import";
import type {
  BillDocument,
  BillDraft,
  CalculationMode,
  FeeMode,
  RecipientData,
  ReceiptOcrItem,
} from "@/lib/harn-tee/types";
import { registerHarnTeeTools } from "@/lib/harn-tee/webmcp";

function makeId(prefix: string) {
  return prefix + "-" + Math.random().toString(36).slice(2, 10);
}

function emptyRecipient(): RecipientData {
  return { name: "", bank: null, promptPay: null, qr: null, visible: true };
}

function BrandMark() {
  return (
    <Link href="/" className="inline-flex items-center gap-2.5 text-[#1c4036]">
      <Image src="/harn-tee-icon.png" alt="หารที" width={48} height={48} className="h-11 w-11 rounded-2xl object-cover shadow-[0_8px_18px_rgb(23_63_53/16%)]" />
      <span>
        <span className="block font-display text-2xl font-bold leading-none tracking-[-0.04em]">harn-tee</span>
        <span className="mt-0.5 block text-[11px] font-semibold tracking-[0.08em] text-[#7a9184]">หารที</span>
      </span>
    </Link>
  );
}

export function HarnTeeApp({ initialDocument,initialSnapshot, editToken,sessionDependencies }: { initialDocument?: BillDocument;initialSnapshot?:DraftAck; editToken?: string;sessionDependencies?:{store:DraftStore;api:DraftApi} }) {
  const router=useRouter();
  const session=useDraftSession({initialDocument,initialSnapshot,editToken,dependencies:sessionDependencies});
  const api=useRef(sessionDependencies?.api??createDraftApi()).current;
  const draft=session.form.draft,step=session.form.step,qrFile=session.qr.kind==="local"?session.qr.file:null;
  const isEditMode=session.remote?.status==="published";
  const draftEditToken=session.remote?.editToken;
  const [newConfirmation,setNewConfirmation]=useState(false);
  const [recoveryCopy,setRecoveryCopy]=useState<{signature:string;shareUrl?:string;editUrl:string;copied:boolean;acknowledged:boolean}|null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [totalBarHeight,setTotalBarHeight]=useState(84);
  const [saved, setSaved] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);
  const totalBarVisible=step===1&&session.phase==="editing";
  useEffect(()=>{
    if(!totalBarVisible)return;
    const root=document.documentElement,previous=root.style.getPropertyValue("--harn-bottom-clearance");
    root.style.setProperty("--harn-bottom-clearance",`${totalBarHeight+16}px`);
    const focused=document.activeElement;
    const frame=focused instanceof HTMLElement&&focused.matches("input,textarea,select")&&typeof requestAnimationFrame==="function"
      ?requestAnimationFrame(()=>focused.scrollIntoView?.({block:"nearest"})):undefined;
    return ()=>{if(previous)root.style.setProperty("--harn-bottom-clearance",previous);else root.style.removeProperty("--harn-bottom-clearance");if(frame!==undefined)cancelAnimationFrame(frame);};
  },[totalBarHeight,totalBarVisible]);
  const [paidState, setPaidState] = useState<Record<string, boolean>>(() =>
    Object.fromEntries((initialDocument??initialSnapshot?.document)?.participants.map((person) => [person.id, person.paid]) ?? []),
  );
  const calculation = useMemo(() => calculateBill(draft), [draft]);
  const links=session.completion;
  const setDraft=(updater:(draft:BillDraft)=>BillDraft)=>{setSaved(false);setRecoveryCopy(null);session.setForm(form=>({...form,draft:updater(form.draft)}));};
  const setStep=(updater:number|((step:number)=>number))=>session.setForm(form=>({...form,step:Math.max(0,Math.min(2,typeof updater==="function"?updater(form.step):updater)) as 0|1|2}));
  const onNumericChange=(field:NumericField,raw:string)=>{setSaved(false);setRecoveryCopy(null);session.setForm(form=>setNumericInput(form,field,raw));};
  const report=(caught:unknown)=>setError(caught instanceof DraftApiError?(caught.status===409?"ข้อมูลเปลี่ยนจากอีกหน้าหรืออีกเครื่อง กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก":"เชื่อมต่อไม่สำเร็จ กรุณาลองอีกครั้ง"):caught instanceof Error?caught.message:"บันทึกไม่สำเร็จ กรุณาลองใหม่");
  const startNew=async()=>{await session.beginNew();setNewConfirmation(false);setRecoveryCopy(null);setSaved(false);setError("");setSelectedPerson(null);if(editToken)router.push("/");};
  const draftRef = useRef(draft);
  const actionsRef=useRef({setStep,setDraft});
  useEffect(() => {
    draftRef.current = draft;
    actionsRef.current={setStep,setDraft};
  });

  useEffect(() => registerHarnTeeTools({
    getDraft: () => draftRef.current,
    start: () => actionsRef.current.setStep(0),
    addItem: (item) => actionsRef.current.setDraft((current) => ({ ...current, items: [...current.items, item] })),
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

  const removeItem = (id: string) => {setSaved(false);setRecoveryCopy(null);session.setForm(form=>{
    const without=(map:Record<string,string>)=>Object.fromEntries(Object.entries(map).filter(([key])=>key!==id));
    return {...form,draft:{...form.draft,items:form.draft.items.filter(item=>item.id!==id).map((item,order)=>({...item,order}))},numbers:{...form.numbers,prices:without(form.numbers.prices),itemVat:without(form.numbers.itemVat),itemService:without(form.numbers.itemService)}};
  });};

  const updateItem = (id: string, patch: Partial<BillDraft["items"][number]>) => setDraft((current) => ({
    ...current,
    items: current.items.map((item) => item.id === id ? { ...item, ...patch } : item),
  }));

  const importReceiptItems = (receiptItems: ReceiptOcrItem[]) => setDraft((current) => ({
    ...current,
    items: appendReceiptItems(
      current.items,
      receiptItems.filter(isReceiptItemReady),
      current.participants.map(({ id }) => id),
      (index) => makeId("item") + "-" + index,
    ),
  }));

  const nextStep = async () => {
    setError("");
    if (step === 0) {
      const names = draft.participants.map((person) => person.name.trim().toLocaleLowerCase());
      if (names.some((name) => !name)) return setError("กรอกชื่อทุกคนก่อนนะ");
      if (new Set(names).size !== names.length) return setError("ชื่อคนในบิลต้องไม่ซ้ำกัน");
    }
    if (step === 1) {
      const validation = validateFormForPublication(session.form,session.qr.kind!=="none");
      if (!validation.valid) return setError(validation.errors[0]);
    }
    if (step === 0) {
      try {
        setSaving(true);
        await session.ensureRemote();
        setStep(1);
      } catch (caught) {
        report(caught);
      }finally{setSaving(false);}
      return;
    }
    setStep((current) => Math.min(2, current + 1));
  };

  const saveBill = async () => {
    setError("");
    setSaving(true);
    let generation="";
    try {
      const context=await session.prepareSubmission();generation=context.generation;
      const signature=context.generation+"|"+context.remote.editToken+"|"+(context.remote.shareToken??"");
      const result=await confirmDraftPublication(context,{api,rememberRemote:session.rememberRemote},{recoveryCopyAcknowledged:recoveryCopy?.signature===signature&&recoveryCopy.copied&&recoveryCopy.acknowledged});
      if (context.remote.status==="published") {
        await session.completePublishedUpdate(result.document,result.remote);
        setPaidState(Object.fromEntries(draft.participants.map((person) => [person.id, false])));
        setSaved(true);
      } else {
        await session.completeSubmission({kind:"complete",schemaVersion:1,localId:context.localId,localVersion:context.localVersion,billId:result.remote.id,lifecycle:result.remote.lifecycle,shareUrl:window.location.origin+"/share/"+result.remote.shareToken,editUrl:window.location.origin+"/edit/"+result.remote.editToken,savedAt:result.document.updatedAt});
      }
      setRecoveryCopy(null);
    } catch (caught) {
      if(caught instanceof RecoveryCopyRequiredError){
        const remote=caught.remote;setRecoveryCopy({signature:generation+"|"+remote.editToken+"|"+(remote.shareToken??""),shareUrl:remote.shareToken?window.location.origin+"/share/"+remote.shareToken:undefined,editUrl:window.location.origin+"/edit/"+remote.editToken,copied:false,acknowledged:false});
        setError("บันทึกดราฟต์ในเครื่องไม่ได้ กรุณาคัดลอกลิงก์กู้คืนและยืนยันว่าเก็บไว้แล้ว ก่อนลองยืนยันบิลอีกครั้ง");
      }else report(caught);
      session.failSubmission(caught);
    } finally {
      setSaving(false);
    }
  };

  const toggleAdminPaid = async (participantId: string) => {
    if (!draftEditToken||!isEditMode) return;
    const nextPaid = !paidState[participantId];
    const response = await fetch("/api/bills/" + draftEditToken + "/status", {
      method: "POST",
      headers: { "Content-Type": "application/json","If-Match":`"${session.remote!.revision}"` },
      body: JSON.stringify({ participantId, paid: nextPaid }),
    });
    if(response.status===409){const conflict=new DraftApiError(409,"revision-conflict");session.failSubmission(conflict);report(conflict);return;}
    if(response.ok){const body=await response.json() as {revision:string};setPaidState((current) => ({ ...current, [participantId]: nextPaid }));await session.rememberRemote({...session.remote!,revision:body.revision}).catch(()=>undefined);}else setError("อัปเดตสถานะไม่สำเร็จ กรุณาลองอีกครั้ง");
  };

  if(session.phase==="hydrating")return <main className="mx-auto max-w-2xl p-6 text-[#243b53]"><BrandMark/><p role="status" className="mt-8">กำลังโหลดดราฟต์…</p>{session.remoteSave.status==="error"&&<Button onClick={()=>void session.loadLatest().catch(report)}>ลองโหลดอีกครั้ง</Button>}{error&&<p role="alert">{error}</p>}</main>;
  if(session.phase==="recovery"&&session.recovery)return <main className="mx-auto max-w-2xl p-6"><BrandMark/><DraftRecovery candidate={session.recovery} onResume={()=>void session.resume().catch(report)} onStartFresh={()=>void startNew().catch(report)}/></main>;

  if (links) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-14">
        <BrandMark />
        <div className="mt-10"><LinkPanel shareUrl={links.shareUrl} editUrl={links.editUrl} onStartNew={()=>setNewConfirmation(true)}/></div>
        {session.localSave.status==="error"&&<p className="mt-4 rounded-xl bg-[#fff5df] p-4 text-sm text-[#79521e]">บันทึกบิลสำเร็จแล้ว แต่จำหน้านี้ในเครื่องไม่ได้ กรุณาเก็บลิงก์แก้ไขไว้</p>}
        {newConfirmation&&<section className="mt-4 space-y-3 rounded-xl border bg-white p-4 text-[#243b53]"><p>เก็บลิงก์แก้ไขบิลเดิมไว้ก่อนนะ บิลเดิมและลิงก์แชร์ยังใช้งานได้</p><Button onClick={()=>void startNew().catch(report)}>เก็บลิงก์แล้ว เริ่มบิลใหม่</Button><Button variant="ghost" onClick={()=>setNewConfirmation(false)}>ยกเลิก</Button></section>}
      </div>
    );
  }

  return (
    <main className="harn-bill-entry min-h-screen px-4 pb-12 pt-5 sm:px-6 sm:pt-8" style={totalBarVisible?{paddingBottom:totalBarHeight+32}:undefined}>
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex items-center justify-between gap-4">
          <BrandMark />
          <div className="hidden items-center gap-2 text-xs font-semibold text-[#789085] sm:flex">
            <Sparkles size={15} className="text-[#e77b57]" />
            ช่วยหารบิลที่เราจ่ายกันไป
          </div>
        </header>

        <div className="mx-auto max-w-4xl">
          <section className="mb-8 overflow-hidden rounded-[2rem] border border-[#d9e7f0] bg-[#f5fbff] shadow-[0_24px_70px_rgb(36_87_117/10%)]">
            <div className="grid md:grid-cols-[1.08fr_0.92fr]">
              <div className="relative z-10 flex flex-col justify-center p-6 sm:p-8 lg:p-10">
                <div className="mb-4 inline-flex w-fit items-center rounded-full border border-[#cfe5f3] bg-white/80 px-3 py-1.5 text-xs font-bold text-[#397181]">
                  แชร์บิลให้เพื่อนแบบสบายใจ
                </div>
                <h1 className="font-display text-[clamp(2rem,6vw,3.8rem)] leading-[1.04] tracking-[-0.05em] text-[#173f35]">
                  หารที แชร์บิลที่ร่วมจ่าย <span className="text-[#e87553]">ให้หารง่ายกว่าที่เคย</span>
                </h1>
                <p className="mt-4 max-w-xl text-base leading-7 text-[#526f80] sm:text-lg">
                  ระบุผู้ร่วมจ่ายและรายการที่จ่าย ระบบคำนวณยอดให้แต่ละคน พร้อมแชร์สรุปได้ในไม่กี่ขั้น
                </p>
              </div>
              <div className="relative min-h-[245px] overflow-hidden sm:min-h-[320px] md:min-h-[390px]">
                <Image
                  src="/harn-tee-banner.png"
                  alt="เพื่อนๆ กำลังช่วยกันหารบิลค่าอาหาร"
                  fill
                  priority
                  sizes="(max-width: 767px) 100vw, 55vw"
                  className="object-cover object-[62%_center]"
                />
              </div>
            </div>
          </section>
          <Stepper current={step} />
          <DraftSaveStatus local={session.localSave} remote={session.remoteSave} onRetry={session.retrySave} onLoadLatest={()=>void session.loadLatest().catch(report)}/>
          {draftEditToken && !isEditMode ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#eadfd2] bg-[#fffaf4] px-4 py-3 text-sm text-[#8d6d59]">
              <span>ลิงก์แก้ไขถูกสร้างแล้ว เก็บไว้ก่อนกรอกต่อได้เลย</span>
              <CopyButton value={window.location.origin + "/edit/" + draftEditToken} label="คัดลอกลิงก์แก้ไข" />
            </div>
          ) : null}

          <fieldset disabled={saving||session.phase==="submitting"} className="mt-6 min-w-0 space-y-5">
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
                {totalBarVisible&&<LiveBillTotals form={session.form} onNext={nextStep} disabled={saving} onHeightChange={setTotalBarHeight}/>}
                <ItemEditor items={draft.items} participants={draft.participants} feeMode={draft.feeMode ?? "bill"} onChange={updateItem} onAdd={addItem} onRemove={removeItem} onImport={importReceiptItems} numbers={session.form.numbers} onNumericChange={onNumericChange}/>
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
                  numbers={session.form.numbers}
                  onNumericChange={onNumericChange}
                />
                <PaymentEditor
                  recipient={draft.recipient ?? emptyRecipient()}
                  qrFile={qrFile}
                  onChange={(recipient) => setDraft((current) => ({ ...current, recipient }))}
                  onQrChange={file=>{if(file)void session.selectQr(file).catch(report);}}
                  nationalIdReentryRequired={"paymentReentryRequired" in session.form&&Boolean(session.form.paymentReentryRequired)}
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
            {recoveryCopy&&<section className="space-y-3 rounded-xl border bg-[#fff5df] p-4 text-sm text-[#79521e]">
              <p>การทำต่อครั้งนี้จะจำลิงก์ในเครื่องไม่ได้ เก็บลิงก์เหล่านี้เพื่อกู้คืนบิล</p>
              <Button variant="outline" onClick={async()=>{try{await navigator.clipboard.writeText([recoveryCopy.editUrl,recoveryCopy.shareUrl].filter(Boolean).join("\n"));setRecoveryCopy({...recoveryCopy,copied:true});}catch{setError("คัดลอกไม่สำเร็จ กรุณาลองอีกครั้ง");}}}>{recoveryCopy.copied?"คัดลอกลิงก์กู้คืนแล้ว":"คัดลอกลิงก์กู้คืน"}</Button>
              <label className="flex items-center gap-2"><input type="checkbox" disabled={!recoveryCopy.copied} checked={recoveryCopy.acknowledged} onChange={event=>setRecoveryCopy({...recoveryCopy,acknowledged:event.target.checked})}/>ฉันเก็บลิงก์กู้คืนแล้ว</label>
            </section>}

            <div className="flex items-center justify-between gap-3">
              {step > 0 ? (
                <Button type="button" variant="ghost" onClick={() => { setError(""); setStep((current) => current - 1); }} className="h-12 rounded-xl text-[#537166] hover:bg-[#eef7eb]">
                  <ArrowLeft size={17} /> ย้อนกลับ
                </Button>
              ) : <span />}
              {step === 0 ? (
                <Button type="button" onClick={nextStep} className="h-12 rounded-xl bg-[#ef6c4d] px-5 text-base font-bold text-white shadow-[0_9px_20px_rgb(239_108_77/22%)] hover:bg-[#d95c40]">
                  ไปใส่รายการสินค้า <ArrowRight size={17} />
                </Button>
              ) : step===2 ? (
                <Button type="button" onClick={saveBill} disabled={saving} className="h-12 rounded-xl bg-[#2f7256] px-5 text-base font-bold text-white shadow-[0_9px_20px_rgb(47_114_86/22%)] hover:bg-[#265d48]">
                  {saving ? "กำลังบันทึก..." : isEditMode ? "บันทึกการแก้ไข" : "ยืนยันและสร้างลิงก์แชร์"} <Check size={17} />
                </Button>
              ) : null}
            </div>
            {saved ? <div className="rounded-xl border border-[#bfdcc8] bg-[#eff9f0] px-4 py-3 text-sm font-semibold text-[#2f7256]">บันทึกการแก้ไขแล้ว ลองเปิด share link เพื่อดูผลล่าสุด</div> : null}
          </fieldset>
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
