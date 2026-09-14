import { Percent } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function FeeEditor({
  vatPercent,
  serviceChargePercent,
  onChange,
}: {
  vatPercent: number;
  serviceChargePercent: number;
  onChange: (key: "vatPercent" | "serviceChargePercent", value: number) => void;
}) {
  return (
    <Card className="border-[#dfe8df] bg-white/85 shadow-[0_22px_60px_rgb(32_67_56/7%)]">
      <CardHeader className="space-y-1">
        <div className="mb-1 grid h-11 w-11 place-items-center rounded-2xl bg-[#f1eefb] text-[#6e5a9f]">
          <Percent size={21} />
        </div>
        <CardTitle className="font-display text-2xl text-[#1c4036]">ค่าบริการเพิ่มเติม</CardTitle>
        <p className="text-sm text-[#6d8176]">คิดจากยอดสินค้าเท่านั้น ไม่คิดซ้อนกัน</p>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-sm font-semibold text-[#4d665b]">VAT</span>
          <div className="relative">
            <Input
              inputMode="decimal"
              value={vatPercent}
              onChange={(event) => onChange("vatPercent", Number(event.target.value) || 0)}
              className="h-11 rounded-xl border-[#dfe8df] bg-[#fbfdf9] pr-10"
              min={0}
              max={100}
              step="0.01"
            />
            <span className="pointer-events-none absolute right-3 top-3 text-sm text-[#809087]">%</span>
          </div>
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-semibold text-[#4d665b]">Service charge</span>
          <div className="relative">
            <Input
              inputMode="decimal"
              value={serviceChargePercent}
              onChange={(event) =>
                onChange("serviceChargePercent", Number(event.target.value) || 0)
              }
              className="h-11 rounded-xl border-[#dfe8df] bg-[#fbfdf9] pr-10"
              min={0}
              max={100}
              step="0.01"
            />
            <span className="pointer-events-none absolute right-3 top-3 text-sm text-[#809087]">%</span>
          </div>
        </label>
      </CardContent>
    </Card>
  );
}
