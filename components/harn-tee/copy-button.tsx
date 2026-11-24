import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CopyButton({ value, label = "คัดลอก",disabled=false }: { value: string; label?: string;disabled?:boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      disabled={disabled}
      variant="outline"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      }}
      className="h-9 rounded-xl border-[#cbdccf] bg-white text-[#315f50] hover:bg-[#eef7eb]"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? "คัดลอกแล้ว" : label}
    </Button>
  );
}
