"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Camera, Check, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatBaht } from "@/lib/harn-tee/money";
import { isReceiptItemReady } from "@/lib/harn-tee/receipt-import";
import {
  disposeReceiptOcrWorker,
  recognizeReceipt,
  type ReceiptOcrProgress,
} from "@/lib/harn-tee/receipt-ocr";
import type { ParticipantDraft, ReceiptOcrItem } from "@/lib/harn-tee/types";

type ScannerState = "idle" | "reading" | "review" | "error";

function makeManualId(index: number) {
  return "manual-" + index;
}

function updateReviewedItem(
  item: ReceiptOcrItem,
  patch: Partial<Pick<ReceiptOcrItem, "name" | "priceSatang">>,
): ReceiptOcrItem {
  const next = { ...item, ...patch };
  return {
    ...next,
    status: isReceiptItemReady({ ...next, status: "ready" }) && !next.reviewReasons?.length ? "ready" : "needs-review",
  };
}

export function ReceiptScanner({
  participants,
  onImport,
}: {
  participants: readonly ParticipantDraft[];
  onImport: (items: ReceiptOcrItem[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const nextManualId = useRef(0);
  const [state, setState] = useState<ScannerState>("idle");
  const [rows, setRows] = useState<ReceiptOcrItem[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [isEmptyResult, setIsEmptyResult] = useState(false);
  const [priceValues, setPriceValues] = useState<Record<string, string>>({});
  const [subtotalSatang, setSubtotalSatang] = useState<number | null>(null);
  const [ignoredLines, setIgnoredLines] = useState<string[]>([]);
  const [progress, setProgress] = useState<ReceiptOcrProgress>({
    phase: "preparing",
    progress: 0,
    message: "กำลังเตรียมรูปใบเสร็จ",
  });

  const resetInput = () => {
    if (inputRef.current) inputRef.current.value = "";
  };

  const leaveToIdle = (disposeWorker: boolean) => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (disposeWorker) void disposeReceiptOcrWorker();
    setRows([]);
    setPriceValues({});
    setSubtotalSatang(null);
    setIgnoredLines([]);
    setErrorMessage("");
    setIsEmptyResult(false);
    setState("idle");
    resetInput();
  };

  const cancel = () => leaveToIdle(true);

  useEffect(() => () => {
    abortRef.current?.abort();
    void disposeReceiptOcrWorker();
  }, []);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setState("reading");
    setErrorMessage("");
    setIsEmptyResult(false);
    setProgress({ phase: "preparing", progress: 0, message: "กำลังเตรียมรูปใบเสร็จ" });

    try {
      const result = await recognizeReceipt(file, {
        signal: controller.signal,
        onProgress: setProgress,
      });
      if (controller.signal.aborted) return;
      const parsedRows = result.items;
      if (parsedRows.length === 0) {
        setRows([]);
        setErrorMessage("อ่านไม่พบรายการ");
        setIsEmptyResult(true);
        setState("error");
        return;
      }
      setRows(parsedRows);
      setSubtotalSatang(result.subtotalSatang);
      setIgnoredLines(result.ignoredLines);
      setState("review");
    } catch (caught) {
      if (caught instanceof Error && caught.name === "AbortError") return;
      const message = caught instanceof Error ? caught.message : "";
      const isUserFacingError = /^(ไฟล์ต้องเป็นรูปภาพ|ไฟล์ใบเสร็จต้องมีขนาด|เปิดรูปใบเสร็จไม่ได้|เตรียมรูปใบเสร็จไม่ได้|แปลงรูปใบเสร็จไม่ได้|รูปใบเสร็จยาวเกินไป|ขนาดรูปใบเสร็จ|กรุณาเลือกรูปใบเสร็จ)/.test(message);
      setErrorMessage(isUserFacingError ? message : "อ่านใบเสร็จไม่สำเร็จ กรุณาลองใหม่หรือกรอกเอง");
      setIsEmptyResult(false);
      setState("error");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      resetInput();
    }
  };

  const updateRow = (id: string, patch: Partial<Pick<ReceiptOcrItem, "name" | "priceSatang">>) => {
    setRows((current) => current.map((item) => item.id === id ? updateReviewedItem(item, patch) : item));
  };

  const addRow = () => {
    const id = makeManualId(nextManualId.current++);
    setRows((current) => [
      ...current,
      { id, name: "", priceSatang: null, rawLine: "", confidence: null, status: "needs-review" },
    ]);
  };

  const removeRow = (id: string) => {
    setRows((current) => current.filter((item) => item.id !== id));
    setPriceValues((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  };

  const confirmImport = () => {
    if (rows.length === 0 || rows.some((item) => !isReceiptItemReady(item))) return;
    onImport(rows.filter(isReceiptItemReady).map(({ id, name, priceSatang, rawLine, confidence }) => ({ id, name, priceSatang, rawLine, confidence, status: "ready" })));
    leaveToIdle(false);
  };

  if (state === "idle") {
    return (
      <Card className="border-[#d6e5dc] bg-[#f9fcf8] shadow-none">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-[#315f50]">เติมรายการจากรูปใบเสร็จ</p>
            <p className="mt-1 text-sm text-[#71867b]">
              ระบบอ่านรายการให้ แล้วตรวจสอบก่อนใช้ · จะแบ่งให้ {participants.length} คน
            </p>
          </div>
          <div className="shrink-0">
            <Button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="h-11 w-full rounded-xl bg-[#2e7255] text-white hover:bg-[#245d46] sm:w-auto"
            >
              <Camera size={17} />
              ถ่ายรูปใบเสร็จ
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="environment"
              aria-label="เลือกรูปใบเสร็จ"
              onChange={handleFileChange}
              className="sr-only"
            />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (state === "reading") {
    return (
      <Card className="border-[#d6e5dc] bg-[#f9fcf8] shadow-none">
        <CardContent className="space-y-4 p-4">
          <div role="status" aria-live="polite" className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-[#315f50]">
            {progress.message} {Math.round(progress.progress * 100)}%
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[#e2eee5]">
            <div className="h-full rounded-full bg-[#2e7255] transition-all" style={{ width: `${Math.max(5, progress.progress * 100)}%` }} />
          </div>
          <Button type="button" variant="outline" onClick={cancel} className="h-10 rounded-xl border-[#c6d8cc] text-[#315f50]">
            ยกเลิก
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (state === "error") {
    return (
      <Card className="border-[#f0d8cb] bg-[#fffaf7] shadow-none">
        <CardContent className="space-y-3 p-4">
          <p role="alert" className="font-semibold text-[#a14f3c]">{errorMessage}</p>
          {isEmptyResult ? null : <p className="text-sm text-[#806e65]">ลองถ่ายให้เห็นตัวอักษรและราคาเต็มบรรทัดอีกครั้ง</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={cancel} className="rounded-xl bg-[#2e7255] text-white hover:bg-[#245d46]">
              ลองใหม่
            </Button>
            <Button type="button" variant="outline" onClick={cancel} className="rounded-xl border-[#d8c6bd] text-[#805f53]">
              กลับไปกรอกเอง
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const canImport = rows.length > 0 && rows.every(isReceiptItemReady);
  const sumSatang = rows.reduce((sum, item) => sum + (item.priceSatang ?? 0), 0);
  const subtotalMismatch = subtotalSatang !== null && rows.every((item) => item.priceSatang !== null) && sumSatang !== subtotalSatang;
  return (
    <Card className="border-[#d6e5dc] bg-[#f9fcf8] shadow-none">
      <CardHeader className="space-y-1 p-4 pb-2">
        <CardTitle className="text-xl text-[#1c4036]">ตรวจสอบรายการจากใบเสร็จ</CardTitle>
        <p className="text-sm leading-6 text-[#6d8176]">
          ระบบอ่านจากภาพ อาจคลาดเคลื่อน กรุณาตรวจสอบทุกรายการก่อนยืนยัน
        </p>
        <p role="status" aria-live="polite" className="text-xs font-semibold text-[#557866]">
          อ่านได้ {rows.length} รายการ · จะแบ่งให้ {participants.length} คน
        </p>
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-2">
        {subtotalMismatch ? <p role="status" className="rounded-xl bg-[#fff0e5] p-3 text-sm leading-6 text-[#88492e]">ยอดสินค้าที่อ่านได้ {formatBaht(sumSatang)} บาท ต่างจากยอดสินค้าในใบเสร็จ {formatBaht(subtotalSatang)} บาท กรุณาตรวจรายการที่ตกหล่นหรือราคาที่คลาดเคลื่อน</p> : null}
        {ignoredLines.length ? <details className="rounded-xl bg-[#eef6ef] px-3 py-2 text-xs leading-5 text-[#456353]"><summary className="cursor-pointer">ข้อความอื่นที่ไม่ได้นำเข้า {ignoredLines.length} บรรทัด</summary><p className="mt-2 whitespace-pre-line break-words">{ignoredLines.join("\n")}</p></details> : null}
        {rows.map((item, index) => (
          <div key={item.id} className="rounded-xl border border-[#dfeae1] bg-white p-3">
            {item.previewUrl ? <Image src={item.previewUrl} alt={`ภาพรายการที่ ${index + 1}`} width={600} height={120} unoptimized className="mb-3 h-auto max-h-32 w-full rounded-lg border border-[#e4ece6] bg-white object-contain" /> : null}
            <div className="flex items-start gap-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#eef6ef] text-xs font-bold text-[#688177]">
                {index + 1}
              </span>
              <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[1fr_130px]">
                <Input
                  aria-label={`ชื่อรายการที่ ${index + 1}`}
                  value={item.name}
                  onChange={(event) => updateRow(item.id, { name: event.target.value })}
                  placeholder="ชื่อรายการ"
                  className="h-10 rounded-xl border-[#dfe8df]"
                />
                <Input
                  aria-label={`ราคาของรายการที่ ${index + 1}`}
                  inputMode="decimal"
                  value={priceValues[item.id] ?? (item.priceSatang === null ? "" : formatBaht(item.priceSatang))}
                  onChange={(event) => {
                    const rawValue = event.target.value;
                    setPriceValues((current) => ({ ...current, [item.id]: rawValue }));
                    const value = rawValue.replace(/,/g, "");
                    const amount = Number(value);
                    updateRow(item.id, { priceSatang: value.trim() && Number.isFinite(amount) ? Math.round(amount * 100) : null });
                  }}
                  onBlur={() => setPriceValues((current) => ({
                    ...current,
                    [item.id]: item.priceSatang === null ? "" : formatBaht(item.priceSatang),
                  }))}
                  placeholder="0.00"
                  className="h-10 rounded-xl border-[#dfe8df] text-right"
                />
              </div>
              <Button type="button" variant="ghost" size="icon" aria-label={`ลบรายการที่ ${index + 1}`} onClick={() => removeRow(item.id)} className="h-9 w-9 shrink-0 rounded-xl text-[#a36a5a] hover:bg-[#fff1ec] hover:text-[#c54f3b]">
                <Trash2 size={16} />
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 pl-10">
              {item.status === "needs-review" ? <span className="rounded-full bg-[#fff0e5] px-2.5 py-1 text-xs font-bold text-[#a45c3f]">ตรวจสอบ</span> : null}
              {item.rawLine ? (
                <details className="text-xs text-[#7b8d83]">
                  <summary className="cursor-pointer">ดูบรรทัดจากภาพ</summary>
                  <p className="mt-1 break-words">{item.rawLine}</p>
                </details>
              ) : null}
            </div>
            {item.reviewReasons?.length ? <p className="mt-2 break-words pl-10 text-xs leading-5 text-[#88492e]">{item.reviewReasons.join(" · ")}</p> : null}
            {item.suggestedPriceSatang !== undefined ? <div className="mt-2 pl-10"><Button type="button" variant="outline" className="h-auto min-h-9 max-w-full whitespace-normal rounded-xl text-[#315f50]" onClick={() => {
              const priceSatang = item.suggestedPriceSatang!;
              setPriceValues((current) => ({ ...current, [item.id]: formatBaht(priceSatang) }));
              setRows((current) => current.map((row) => row.id === item.id ? { ...row, priceSatang, suggestedPriceSatang: undefined, status: "needs-review" } : row));
            }}>ใช้ราคา {formatBaht(item.suggestedPriceSatang)} บาท</Button></div> : null}
            {item.status === "needs-review" ? <div className="mt-2 pl-10"><Button type="button" variant="outline" size="sm" aria-label={`ยืนยันรายการที่ ${index + 1}`} disabled={!isReceiptItemReady({ ...item, status: "ready" })} onClick={() => setRows((current) => current.map((row) => row.id === item.id ? { ...row, status: "ready", reviewReasons: [], suggestedPriceSatang: undefined } : row))} className="rounded-xl border-[#bdcec1] text-[#315f50]"><Check size={14} />ตรวจแล้ว ถูกต้อง</Button></div> : null}
          </div>
        ))}
        <Button type="button" variant="outline" onClick={addRow} className="h-10 w-full rounded-xl border-dashed border-[#bdcec1] text-[#315f50] hover:bg-[#eef7eb]">
          <Plus size={16} />
          เพิ่มรายการ
        </Button>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={cancel} className="h-10 rounded-xl border-[#c6d8cc] text-[#315f50]">
            ยกเลิก
          </Button>
          <Button type="button" disabled={!canImport} onClick={confirmImport} className="h-10 rounded-xl bg-[#2e7255] text-white hover:bg-[#245d46] disabled:bg-[#b9c9bf]">
            เพิ่มเข้ารายการสินค้า
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
