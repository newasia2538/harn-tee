import { Button } from "@/components/ui/button";
import { formatBaht } from "@/lib/harn-tee/money";
import type { ParticipantCalculation } from "@/lib/harn-tee/types";

export function ParticipantDetail({
  person,
  onClose,
}: {
  person: ParticipantCalculation;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#102a40]/45 p-0 sm:items-center sm:p-5"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-[28px] bg-[#f7fafc] p-5 shadow-2xl sm:rounded-[28px] sm:p-7"
        role="dialog"
        aria-modal="true"
        aria-labelledby="participant-detail-title"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-[#607387]">รายละเอียดของ</p>
            <h2 id="participant-detail-title" className="font-display text-3xl text-[#15263d]">
              {person.name}
            </h2>
          </div>
          <Button variant="ghost" onClick={onClose} className="rounded-xl text-[#456176]">
            ปิด
          </Button>
        </div>

        <div className="mt-5 space-y-3">
          {person.lineItems.map((item) => (
            <div className="rounded-xl border border-[#d9e3ec] bg-white px-4 py-3" key={item.itemId}>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-[#28445b]">{item.name}</span>
                <strong className="text-[#15263d]">{formatBaht(item.totalSatang)} บาท</strong>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-[#607387]">
                <span>สินค้า {formatBaht(item.amountSatang)}</span>
                <span>Service {formatBaht(item.serviceChargeSatang)}</span>
                <span>VAT {formatBaht(item.vatSatang)}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 space-y-2 border-t border-[#d9e3ec] pt-4 text-sm">
          <div className="flex justify-between text-[#607387]"><span>รวมสินค้า</span><span>{formatBaht(person.itemSubtotalSatang)} บาท</span></div>
          <div className="flex justify-between text-[#607387]"><span>รวม Service charge</span><span>{formatBaht(person.serviceChargeSatang)} บาท</span></div>
          <div className="flex justify-between text-[#607387]"><span>รวม VAT</span><span>{formatBaht(person.vatSatang)} บาท</span></div>
          <div className="flex justify-between pt-2 text-base font-bold text-[#15263d]"><span>ยอดที่ต้องจ่าย</span><span>{formatBaht(person.amountDueSatang)} บาท</span></div>
        </div>
        <Button onClick={onClose} className="mt-6 h-11 w-full rounded-xl bg-[#185c74] text-white hover:bg-[#12485b]">
          กลับไปดูรายชื่อ
        </Button>
      </div>
    </div>
  );
}
