"use client";

import { useState } from "react";
import { Check, Copy, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { maskSensitiveValue } from "@/lib/harn-tee/privacy";

type SensitiveField = "bank" | "promptPay";

export function SensitiveValue({
  token,
  field,
  value,
  label,
}: {
  token: string;
  field: SensitiveField;
  value: string;
  label: string;
}) {
  const [secret, setSecret] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const loadSecret = async () => {
    const response = await fetch(
      "/api/bills/" + encodeURIComponent(token) + "/payment-details?field=" + field,
      { cache: "no-store" },
    );
    const body = await response.json() as { value?: string; error?: string };
    if (!response.ok || typeof body.value !== "string") {
      throw new Error(body.error ?? "เปิดดูข้อมูลไม่สำเร็จ");
    }
    return body.value;
  };

  const toggleReveal = async () => {
    setError("");
    if (revealed) {
      setRevealed(false);
      setSecret(null);
      return;
    }
    setBusy(true);
    try {
      const value = secret ?? await loadSecret();
      setSecret(value);
      setRevealed(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "เปิดดูข้อมูลไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const copyValue = async () => {
    setError("");
    setBusy(true);
    try {
      const value = secret ?? await loadSecret();
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "คัดลอกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-base font-bold tracking-[0.08em] text-[#243b53]">
        {revealed && secret ? secret : maskSensitiveValue(value)}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        aria-label={(revealed ? "ซ่อน" : "แสดง") + label}
        onClick={() => void toggleReveal()}
        className="h-9 rounded-xl border-[#cbdccf] bg-white text-[#315f50] hover:bg-[#eef7eb]"
      >
        {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
        {revealed ? "ซ่อน" : "แสดง"}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        aria-label={"คัดลอก" + label}
        onClick={() => void copyValue()}
        className="h-9 rounded-xl border-[#cbdccf] bg-white text-[#315f50] hover:bg-[#eef7eb]"
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
        {copied ? "คัดลอกแล้ว" : "คัดลอก"}
      </Button>
      {error ? <span role="alert" className="w-full text-xs text-red-700">{error}</span> : null}
    </div>
  );
}
