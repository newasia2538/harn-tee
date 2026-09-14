import { useState } from "react";
import { Check, Plus, Receipt, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ItemDraft, ParticipantDraft } from "@/lib/harn-tee/types";
import { formatBaht } from "@/lib/harn-tee/money";

export function ItemEditor({
  items,
  participants,
  onChange,
  onAdd,
  onRemove,
}: {
  items: ItemDraft[];
  participants: ParticipantDraft[];
  onChange: (id: string, patch: Partial<ItemDraft>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  const [priceValues, setPriceValues] = useState<Record<string, string>>({});

  return (
    <Card className="border-[#dfe8df] bg-white/85 shadow-[0_22px_60px_rgb(32_67_56/7%)]">
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <div className="mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-[#fff0e8] text-[#d36346]">
            <Receipt size={21} />
          </div>
          <CardTitle className="font-display text-2xl text-[#1c4036]">รายการที่จ่าย</CardTitle>
          <p className="mt-1 text-sm text-[#6d8176]">
            เลือกคนที่ต้องช่วยจ่ายของแต่ละชิ้น ระบบจะหารให้ทันที
          </p>
        </div>
        <span className="rounded-full bg-[#eaf3e8] px-3 py-1 text-xs font-semibold text-[#3f6e5c]">
          {items.length} รายการ
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#cbdacc] bg-[#fbfdf9] px-5 py-8 text-center">
            <p className="font-semibold text-[#315f50]">ยังไม่มีรายการ</p>
            <p className="mt-1 text-sm text-[#7c9085]">เริ่มจากเพิ่มของชิ้นแรกที่อยู่ในใบเสร็จ</p>
          </div>
        ) : null}
        {items.map((item, index) => (
          <div className="rounded-2xl border border-[#e1e9e0] bg-[#fbfdf9] p-4" key={item.id}>
            <div className="mb-3 flex items-start gap-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#f1f5ef] text-xs font-bold text-[#688177]">
                {index + 1}
              </span>
              <div className="grid flex-1 gap-2 sm:grid-cols-[1fr_140px]">
                <Input
                  aria-label={"ชื่อรายการที่ " + (index + 1)}
                  value={item.name}
                  onChange={(event) => onChange(item.id, { name: event.target.value })}
                  placeholder="เช่น พิซซ่าหน้าฮาวาย"
                  className="h-10 rounded-xl border-[#dfe8df] bg-white"
                />
                <div className="relative">
                  <Input
                    aria-label={"ราคาของรายการที่ " + (index + 1)}
                    inputMode="decimal"
                    value={priceValues[item.id] ?? (item.priceSatang ? formatBaht(item.priceSatang) : "")}
                    onChange={(event) => {
                      const rawValue = event.target.value;
                      setPriceValues((current) => ({ ...current, [item.id]: rawValue }));
                      const amount = Number(event.target.value.replace(/,/g, ""));
                      onChange(item.id, {
                        priceSatang: Number.isFinite(amount) ? Math.round(amount * 100) : 0,
                      });
                    }}
                    onBlur={() => {
                      setPriceValues((current) => ({
                        ...current,
                        [item.id]: item.priceSatang ? formatBaht(item.priceSatang) : "",
                      }));
                    }}
                    placeholder="0.00"
                    className="h-10 rounded-xl border-[#dfe8df] bg-white pr-14 text-right"
                  />
                  <span className="pointer-events-none absolute right-3 top-2.5 text-xs text-[#8b9b91]">
                    บาท
                  </span>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={"ลบ " + (item.name || "รายการที่ " + (index + 1))}
                onClick={() => onRemove(item.id)}
                className="h-9 w-9 shrink-0 rounded-xl text-[#a36a5a] hover:bg-[#fff1ec] hover:text-[#c54f3b]"
              >
                <Trash2 size={16} />
              </Button>
            </div>
            <div className="border-t border-[#e7eee6] pt-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-[0.08em] text-[#809087]">
                  ใครต้องจ่ายบ้าง
                </p>
                <p className="text-xs text-[#8b9b91]">เลือกได้หลายคน</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {participants.map((person) => {
                  const selected = item.payerIds.includes(person.id);
                  return (
                    <label
                      className={[
                        "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition",
                        selected
                          ? "border-[#77a48f] bg-[#eaf6ed] text-[#2f604f]"
                          : "border-[#e2eae1] bg-white text-[#72847a] hover:border-[#bdd3c2]",
                      ].join(" ")}
                      key={person.id}
                    >
                      <Checkbox
                        checked={selected}
                        onCheckedChange={(checked) => {
                          const nextIds = checked
                            ? [...new Set([...item.payerIds, person.id])]
                            : item.payerIds.filter((id) => id !== person.id);
                          onChange(item.id, { payerIds: nextIds });
                        }}
                        className="border-[#aac3b0] data-[state=checked]:border-[#2e7255] data-[state=checked]:bg-[#2e7255]"
                      />
                      {person.name || "ยังไม่ตั้งชื่อ"}
                      {selected ? <Check size={14} /> : null}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          onClick={onAdd}
          className="h-11 w-full rounded-xl border-dashed border-[#bdcec1] bg-[#fbfdf9] text-[#315f50] hover:bg-[#eef7eb]"
        >
          <Plus size={17} />
          เพิ่มรายการสินค้า
        </Button>
      </CardContent>
    </Card>
  );
}
