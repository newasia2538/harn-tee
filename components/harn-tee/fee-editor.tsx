import { Percent } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CalculationMode, FeeMode } from "@/lib/harn-tee/types";
import { numberInputValue } from "@/lib/harn-tee/input";

export function FeeEditor({
  vatPercent,
  serviceChargePercent,
  feeMode,
  calculationMode,
  onModeChange,
  onCalculationModeChange,
  onChange,
}: {
  vatPercent: number;
  serviceChargePercent: number;
  feeMode: FeeMode;
  calculationMode: CalculationMode;
  onModeChange: (mode: FeeMode) => void;
  onCalculationModeChange: (mode: CalculationMode) => void;
  onChange: (key: "vatPercent" | "serviceChargePercent", value: number) => void;
}) {
  return (
    <Card className="border-[#dfe8df] bg-white/85 shadow-[0_22px_60px_rgb(32_67_56/7%)]">
      <CardHeader className="space-y-1">
        <div className="mb-1 grid h-11 w-11 place-items-center rounded-2xl bg-[#f1eefb] text-[#6e5a9f]">
          <Percent size={21} />
        </div>
        <CardTitle className="font-display text-2xl text-[#1c4036]">ค่าบริการเพิ่มเติม</CardTitle>
        <p className="text-sm text-[#6d8176]">เลือกสูตรให้ตรงกับวิธีคิดบนใบเสร็จ</p>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <p className="mb-2 text-sm font-semibold text-[#243b53]">วิธีคิดค่าธรรมเนียม</p>
          <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="วิธีคิดค่าธรรมเนียม">
            <button
              type="button"
              aria-pressed={feeMode === "bill"}
              onClick={() => onModeChange("bill")}
              className={feeMode === "bill" ? "rounded-xl border-2 border-[#185c74] bg-[#e8f2f6] px-4 py-3 text-left text-sm font-bold text-[#123f53]" : "rounded-xl border border-[#cbd8e5] bg-white px-4 py-3 text-left text-sm font-semibold text-[#607387] hover:border-[#82a8ba]"}
            >
              รวมทั้งบิล
              <span className="mt-1 block text-xs font-normal text-[#607387]">คิดจากยอดสินค้ารวม</span>
            </button>
            <button
              type="button"
              aria-pressed={feeMode === "item"}
              onClick={() => onModeChange("item")}
              className={feeMode === "item" ? "rounded-xl border-2 border-[#185c74] bg-[#e8f2f6] px-4 py-3 text-left text-sm font-bold text-[#123f53]" : "rounded-xl border border-[#cbd8e5] bg-white px-4 py-3 text-left text-sm font-semibold text-[#607387] hover:border-[#82a8ba]"}
            >
              แยกแต่ละรายการ
              <span className="mt-1 block text-xs font-normal text-[#607387]">ตั้งค่าในแต่ละสินค้า</span>
            </button>
          </div>
        </div>
        <div className="sm:col-span-2">
          <p className="mb-2 text-sm font-semibold text-[#243b53]">สูตรคำนวณ VAT + Service charge</p>
          <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="สูตรคำนวณ VAT และ Service charge">
            <button
              type="button"
              aria-pressed={calculationMode === "vat-after-service"}
              onClick={() => onCalculationModeChange("vat-after-service")}
              className={calculationMode === "vat-after-service" ? "rounded-xl border-2 border-[#185c74] bg-[#e8f2f6] px-4 py-3 text-left text-sm font-bold text-[#123f53]" : "rounded-xl border border-[#cbd8e5] bg-white px-4 py-3 text-left text-sm font-semibold text-[#607387] hover:border-[#82a8ba]"}
            >
              สูตรใหม่ · VAT หลัง Service
              <span className="mt-1 block text-xs font-normal text-[#607387]">สินค้า → Service charge → VAT จากยอดรวม</span>
            </button>
            <button
              type="button"
              aria-pressed={calculationMode === "separate"}
              onClick={() => onCalculationModeChange("separate")}
              className={calculationMode === "separate" ? "rounded-xl border-2 border-[#185c74] bg-[#e8f2f6] px-4 py-3 text-left text-sm font-bold text-[#123f53]" : "rounded-xl border border-[#cbd8e5] bg-white px-4 py-3 text-left text-sm font-semibold text-[#607387] hover:border-[#82a8ba]"}
            >
              สูตรเดิม · คิดแยกกัน
              <span className="mt-1 block text-xs font-normal text-[#607387]">VAT และ Service charge คิดจากยอดสินค้าแยกกัน</span>
            </button>
          </div>
        </div>
        {feeMode === "bill" ? <>
        <label className="space-y-1.5">
          <span className="text-sm font-semibold text-[#4d665b]">VAT</span>
          <div className="relative">
            <Input
              inputMode="decimal"
              value={numberInputValue(vatPercent)}
              onChange={(event) => onChange("vatPercent", Number(event.target.value) || 0)}
              placeholder="0"
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
              value={numberInputValue(serviceChargePercent)}
              onChange={(event) =>
                onChange("serviceChargePercent", Number(event.target.value) || 0)
              }
              placeholder="0"
              className="h-11 rounded-xl border-[#dfe8df] bg-[#fbfdf9] pr-10"
              min={0}
              max={100}
              step="0.01"
            />
            <span className="pointer-events-none absolute right-3 top-3 text-sm text-[#809087]">%</span>
          </div>
        </label>
        </> : (
          <p className="rounded-xl bg-[#f5f8fb] px-4 py-3 text-sm leading-6 text-[#40566b] sm:col-span-2">
            เปิดโหมดแยกรายการแล้ว กรอก VAT และ Service charge ใต้สินค้าแต่ละชิ้นได้เลย
          </p>
        )}
      </CardContent>
    </Card>
  );
}
