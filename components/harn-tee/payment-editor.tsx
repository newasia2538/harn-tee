import { useState } from "react";
import { Check, ChevronDown, QrCode, WalletCards } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RecipientData } from "@/lib/harn-tee/types";
import { banks, getBank } from "@/lib/harn-tee/banks";
import { BankMark } from "@/components/harn-tee/bank-mark";

export function PaymentEditor({
  recipient,
  qrFile,
  onChange,
  onQrChange,
}: {
  recipient: RecipientData;
  qrFile: File | null;
  onChange: (recipient: RecipientData) => void;
  onQrChange: (file: File | null) => void;
}) {
  const [bankOpen, setBankOpen] = useState(false);
  const selectedBank = recipient.bank ? getBank(recipient.bank.bankId) : null;
  return (
    <Card className="border-[#dfe8df] bg-white/85 shadow-[0_22px_60px_rgb(32_67_56/7%)]">
      <CardHeader className="space-y-1">
        <div className="mb-1 grid h-11 w-11 place-items-center rounded-2xl bg-[#e9f2f4] text-[#397181]">
          <WalletCards size={21} />
        </div>
        <CardTitle className="font-display text-2xl text-[#1c4036]">ช่องทางรับเงิน</CardTitle>
        <p className="text-sm text-[#6d8176]">กรอกไว้ให้เพื่อนโอนคืนได้จากหน้าสรุป</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold text-[#4d665b]">ชื่อผู้รับเงิน</span>
          <Input
            value={recipient.name}
            onChange={(event) => onChange({ ...recipient, name: event.target.value })}
            placeholder="เช่น มิน"
            className="h-11 rounded-xl border-[#dfe8df] bg-[#fbfdf9]"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-[#4d665b]">ธนาคาร</span>
            <div className="relative">
              <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={bankOpen}
                onClick={() => setBankOpen((open) => !open)}
                className="flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-[#cbd8e5] bg-white px-3 text-left text-sm text-[#243b53] outline-none focus:border-[#185c74] focus:ring-2 focus:ring-[#d7e8ef]"
              >
                {selectedBank ? <span className="flex min-w-0 items-center gap-2"><BankMark bank={selectedBank} size="sm" /><span className="truncate">{selectedBank.id} · {selectedBank.name}</span></span> : <span className="text-[#607387]">ยังไม่เลือกธนาคาร</span>}
                <ChevronDown size={16} className="shrink-0 text-[#607387]" />
              </button>
              {bankOpen ? (
                <div role="listbox" aria-label="เลือกธนาคาร" className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-20 max-h-64 overflow-y-auto rounded-xl border border-[#cbd8e5] bg-white p-1 shadow-xl">
                  <button type="button" role="option" aria-selected={!selectedBank} onClick={() => { onChange({ ...recipient, bank: null }); setBankOpen(false); }} className="w-full rounded-lg px-3 py-2 text-left text-sm text-[#607387] hover:bg-[#eef4f8]">ยังไม่เลือกธนาคาร</button>
                  {banks.map((bank) => (
                    <button type="button" role="option" aria-selected={selectedBank?.id === bank.id} key={bank.id} onClick={() => { onChange({ ...recipient, bank: { bankId: bank.id, accountNumber: recipient.bank?.accountNumber ?? "" } }); setBankOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-[#243b53] hover:bg-[#eef4f8]">
                      <BankMark bank={bank} size="sm" />
                      <span className="truncate">{bank.id} · {bank.name}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-[#4d665b]">เลขบัญชี</span>
            <Input
              inputMode="numeric"
              value={recipient.bank?.accountNumber ?? ""}
              onChange={(event) =>
                onChange({
                  ...recipient,
                  bank: recipient.bank
                    ? { ...recipient.bank, accountNumber: event.target.value.replace(/\D/g, "") }
                    : null,
                })
              }
              placeholder="กรอกเลขบัญชี"
              className="h-11 rounded-xl border-[#dfe8df] bg-[#fbfdf9]"
            />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-[150px_1fr]">
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-[#4d665b]">ประเภท PromptPay</span>
            <select
              value={recipient.promptPay?.type ?? ""}
              onChange={(event) =>
                onChange({
                  ...recipient,
                  promptPay: event.target.value
                    ? { type: event.target.value as "phone" | "national-id", value: recipient.promptPay?.value ?? "" }
                    : null,
                })
              }
              className="h-11 w-full rounded-xl border border-[#dfe8df] bg-[#fbfdf9] px-3 text-sm text-[#315247] outline-none focus:border-[#78a48f] focus:ring-2 focus:ring-[#d9eee0]"
            >
              <option value="">ไม่ใช้</option>
              <option value="phone">เบอร์โทรศัพท์</option>
              <option value="national-id">เลขบัตรประชาชน</option>
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-[#4d665b]">เลข PromptPay</span>
            <Input
              inputMode="numeric"
              value={recipient.promptPay?.value ?? ""}
              onChange={(event) =>
                onChange({
                  ...recipient,
                  promptPay: recipient.promptPay
                    ? { ...recipient.promptPay, value: event.target.value.replace(/\D/g, "") }
                    : null,
                })
              }
              placeholder="10 หรือ 13 หลัก"
              className="h-11 rounded-xl border-[#dfe8df] bg-[#fbfdf9]"
            />
          </label>
        </div>
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#e0e9df] bg-[#fbfdf9] px-3 py-3 text-sm text-[#48675a]">
          <Checkbox
            checked={recipient.visible}
            onCheckedChange={(checked) => onChange({ ...recipient, visible: checked === true })}
            className="border-[#aac3b0] data-[state=checked]:border-[#2e7255] data-[state=checked]:bg-[#2e7255]"
          />
          แสดงข้อมูลรับเงินบนหน้าสรุป
        </label>
        <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-[#cbdccf] bg-[#fbfdf9] px-4 py-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#edf5ef] text-[#3f745f]">
            {qrFile ? <Check size={19} /> : <QrCode size={19} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-[#315f50]">
              {qrFile ? qrFile.name : "เพิ่มรูป QR Payment"}
            </span>
            <span className="mt-0.5 block text-xs text-[#7f9187]">PNG, JPG หรือ WebP ไม่เกิน 5 MB</span>
          </span>
          <span className="rounded-xl bg-[#eaf3e8] px-3 py-2 text-xs font-bold text-[#3f6e5c]">เลือกรูป</span>
          <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => onQrChange(event.target.files?.[0] ?? null)} />
        </label>
      </CardContent>
    </Card>
  );
}
