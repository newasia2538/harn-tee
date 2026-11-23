import type {DraftForm} from "@/lib/harn-tee/draft-state";
import {selectLiveTotals} from "@/lib/harn-tee/live-totals";
import {formatBaht} from "@/lib/harn-tee/money";
export function LiveBillTotals({form}:{form:DraftForm}){
  const {calculation:c,provisional,unassignedCount}=selectLiveTotals(form);
  return <section aria-label="ยอดล่าสุด" className="rounded-2xl border border-[#cbd8e5] bg-[#f5f8fb] p-5 text-[#243b53]">
    <h2 className="font-display text-xl font-bold">ยอดล่าสุด</h2>
    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm" aria-live="polite">
      {[["ยอดสินค้า",c.subtotalSatang],["Service charge",c.serviceChargeSatang],["VAT",c.vatSatang],["ยอดรวมตามใบเสร็จ",c.grossTotalSatang]].map(([label,amount])=><div key={label} className="col-span-2 flex flex-wrap justify-between gap-2"><dt>{label}</dt><dd className="font-semibold tabular-nums">{formatBaht(Number(amount))} บาท</dd></div>)}
    </dl>
    {c.roundingDifferenceSatang>0&&<p className="mt-3 text-sm">ยอดเรียกเก็บหลังปัดเศษ <strong className="whitespace-nowrap">{formatBaht(c.collectedTotalSatang)} บาท</strong></p>}
    {unassignedCount>0&&<p className="mt-2 text-sm text-[#835321]">ยังไม่ได้เลือกผู้ร่วมจ่าย {unassignedCount} รายการ</p>}
    {provisional&&<p className="mt-2 text-sm text-[#835321]">ยอดชั่วคราว — กรุณากรอกรายการ ราคา และผู้ร่วมจ่ายให้ครบ</p>}
  </section>;
}
