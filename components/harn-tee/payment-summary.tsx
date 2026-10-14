"use client";

import { useState } from "react";
import Image from "next/image";
import { Eye, EyeOff, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BankMark } from "@/components/harn-tee/bank-mark";
import { SensitiveValue } from "@/components/harn-tee/sensitive-value";
import { getBank } from "@/lib/harn-tee/banks";
import type { BillDocument } from "@/lib/harn-tee/types";

export function PaymentSummary({
  document,
  token,
  qrAvailable,
  canManage = false,
}: {
  document: BillDocument;
  token: string;
  qrAvailable: boolean;
  canManage?: boolean;
}) {
  const [qrShown, setQrShown] = useState(false);
  const recipient = document.recipient;
  if (!recipient.visible && !canManage) return null;
  const bank = recipient.bank;
  const bankInfo = bank ? getBank(bank.bankId) : null;
  const promptPay = recipient.promptPay;
  if (!recipient.name && !bank && !promptPay && !qrAvailable) return null;

  return (
    <Card className="border-[#dfe8df] bg-white/85 shadow-[0_18px_48px_rgb(32_67_56/6%)]">
      <CardHeader className="space-y-1">
        <div className="mb-1 grid h-10 w-10 place-items-center rounded-2xl bg-[#e9f2f4] text-[#397181]"><WalletCards size={19} /></div>
        <CardTitle className="font-display text-2xl text-[#1c4036]">โอนคืนให้ {recipient.name || "ผู้รับเงิน"}</CardTitle>
        <p className="text-sm text-[#6d8176]">ข้อมูลถูกซ่อนไว้ กดแสดงหรือคัดลอกเมื่อจะใช้งาน</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {bank ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e3ebe1] bg-[#fbfdf9] px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">{bankInfo ? <BankMark bank={bankInfo} size="sm" /> : null}<div className="min-w-0"><p className="text-xs text-[#607387]">บัญชีธนาคาร {bankInfo?.name ?? bank.bankId}</p><SensitiveValue token={token} field="bank" value={bank.accountNumber} label="เลขบัญชี" /></div></div>
          </div>
        ) : null}
        {promptPay ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e3ebe1] bg-[#fbfdf9] px-4 py-3">
            <div><p className="text-xs text-[#809087]">PromptPay · {promptPay.type === "phone" ? "เบอร์โทรศัพท์" : "เลขบัตรประชาชน"}</p><SensitiveValue token={token} field="promptPay" value={promptPay.value} label={promptPay.type === "phone" ? "เบอร์โทรศัพท์" : "เลขบัตรประชาชน"} /></div>
          </div>
        ) : null}
        {qrAvailable ? (
          <div className="rounded-2xl border border-dashed border-[#cbdccf] bg-[#fbfdf9] p-3">
            <p className="mb-3 text-sm font-bold text-[#315f50]">QR สำหรับรับเงิน</p>
            <Button
              type="button"
              variant="outline"
              aria-label={(qrShown ? "ซ่อน" : "แสดง") + " QR สำหรับโอน"}
              onClick={() => setQrShown((shown) => !shown)}
              className="rounded-xl border-[#cbdccf] text-[#315f50]"
            >
              {qrShown ? <EyeOff size={15} /> : <Eye size={15} />}
              {qrShown ? "ซ่อน QR" : "แสดง QR"}
            </Button>
            {qrShown ? <Image src={"/api/bills/" + encodeURIComponent(token) + "/qr"} alt="QR สำหรับรับเงิน" width={208} height={208} unoptimized className="mx-auto mt-3 aspect-square rounded-xl bg-white object-contain p-2" /> : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
