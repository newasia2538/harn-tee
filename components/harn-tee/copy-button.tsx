import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CopyButton({ value, label = "คัดลอก" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
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
