"use client";
import {useEffect,useId,useRef,useState,type CSSProperties} from "react";
import {ArrowRight,ChevronUp} from "lucide-react";
import type {DraftForm} from "@/lib/harn-tee/draft-state";
import {selectLiveTotals} from "@/lib/harn-tee/live-totals";
import {formatBaht} from "@/lib/harn-tee/money";
import {useBottomBarLayout} from "@/lib/harn-tee/use-bottom-bar-layout";

export function LiveBillTotals({form,onNext,disabled=false,onHeightChange}:{form:DraftForm;onNext:()=>void;disabled?:boolean;onHeightChange?:(height:number)=>void}){
  const {calculation:c,provisional,unassignedCount}=selectLiveTotals(form);
  const [expanded,setExpanded]=useState(false),id=useId(),ref=useRef<HTMLElement>(null);
  const {height,bottomInset}=useBottomBarLayout(ref,true);
  useEffect(()=>{onHeightChange?.(height);},[height,onHeightChange]);
  return <section ref={ref} aria-label="ยอดล่าสุด" className="harn-bill-total" style={{bottom:bottomInset,"--bill-total-keyboard-inset":`${bottomInset}px`} as CSSProperties}>
    <div id={id} role="group" aria-label="รายละเอียดค่าบริการและภาษี" hidden={!expanded} className="harn-bill-total-details">
      <dl>
        {[["ยอดสินค้า",c.subtotalSatang],["Service charge",c.serviceChargeSatang],["VAT",c.vatSatang],["ยอดรวมตามใบเสร็จ",c.grossTotalSatang]].map(([label,amount])=><div key={label}><dt>{label}</dt><dd>{formatBaht(Number(amount))} บาท</dd></div>)}
      </dl>
      {c.roundingDifferenceSatang>0&&<p className="mt-2">ยอดเรียกเก็บหลังปัดเศษ <strong>{formatBaht(c.collectedTotalSatang)} บาท</strong></p>}
    </div>
    {(unassignedCount>0||provisional)&&<div role="status" className="harn-bill-total-notice">
      {unassignedCount>0&&<p>ยังไม่ได้เลือกผู้ร่วมจ่าย {unassignedCount} รายการ</p>}
      {provisional&&<p>ยอดชั่วคราว — กรุณากรอกรายการ ราคา และผู้ร่วมจ่ายให้ครบ</p>}
    </div>}
    <div className="harn-bill-total-row">
      <button type="button" className="harn-bill-total-toggle" aria-expanded={expanded} aria-controls={id} onClick={()=>setExpanded(value=>!value)}>
        <span className="harn-bill-total-caption">ยอดล่าสุด <ChevronUp size={13} aria-hidden="true" className={expanded?"rotate-180":""}/></span>
        <span className="harn-bill-total-amount" aria-live="polite">{formatBaht(c.grossTotalSatang)} <small>บาท</small></span>
        <span className="sr-only">ยอดรวมตามใบเสร็จ กดดูรายละเอียดค่าบริการและภาษี</span>
      </button>
      <button type="button" onClick={onNext} disabled={disabled} className="harn-bill-total-next">ตรวจสอบบิล <ArrowRight size={16} aria-hidden="true"/></button>
    </div>
  </section>;
}
