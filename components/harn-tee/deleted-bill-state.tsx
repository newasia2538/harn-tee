"use client";
import {useEffect,useRef} from "react";
import Link from "next/link";
import Image from "next/image";
import {SadReceipt} from "./sad-receipt";
export function DeletedBillState({state}:{state:"deleting"|"deleted"}){
 const heading=useRef<HTMLHeadingElement>(null);useEffect(()=>{heading.current?.focus();},[state]);
 return <main className="deleted-bill-page"><header><Link href="/" className="inline-flex items-center gap-2 font-display text-xl font-bold"><Image src="/harn-tee-icon.png" alt="หารที" width={40} height={40} className="rounded-xl"/>harn-tee</Link></header><section className="deleted-bill-card"><SadReceipt/><p className="mt-6 text-xs font-semibold tracking-wide text-slate-500">{state==="deleted"?"บิลไม่พร้อมใช้งาน":"อยู่ระหว่างดำเนินการ"}</p><h1 ref={heading} tabIndex={-1} className="mt-3 font-display text-2xl font-semibold leading-relaxed outline-none sm:text-3xl">{state==="deleted"?"บิลนี้ได้ถูกลบออกจากระบบแล้ว":"กำลังลบบิลและ QR Code"}</h1><p className="mt-4 text-sm leading-7 text-slate-600">ขออภัย ท่านไม่สามารถดูรายละเอียดหรือแก้ไขบิลนี้ได้อีก</p><p className="mt-5 rounded-xl bg-slate-50 p-4 text-xs leading-6 text-slate-600">{state==="deleted"?"ข้อมูลบิลและ QR Code สำหรับรับชำระเงินถูกลบออกจากระบบแล้ว":"ระบบปิดการเข้าถึงบิลแล้ว และกำลังดำเนินการลบ QR Code สำหรับรับชำระเงิน"}</p></section><footer><Link href="/" className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-[#185c74] px-5 py-3 text-sm font-semibold text-white sm:w-auto">กลับสู่หน้าแรก</Link></footer></main>;
}
