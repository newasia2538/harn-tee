"use client";
import {DocumentLink as Link} from "@/components/harn-tee/document-link";
import {Button} from "@/components/ui/button";
import {formatBaht} from "@/lib/harn-tee/money";
import {useBillHistory} from "@/lib/harn-tee/bill-history-provider";
import type {HistoryEntry} from "@/lib/harn-tee/history-state";
import {BillExpiry} from "./bill-expiry";
import {CopyButton} from "./copy-button";
const statuses={draft:["ดราฟต์","bg-slate-100 text-slate-700"],unpaid:["รอชำระ","bg-sky-50 text-sky-800"],partial:["ชำระบางส่วน","bg-orange-50 text-orange-800"],paid:["ชำระครบแล้ว","bg-emerald-50 text-emerald-800"]} as const;
export function BillHistoryList({entries,onDelete,onRefresh}:{entries:HistoryEntry[];onDelete:(entry:HistoryEntry)=>void;onRefresh:()=>void}){
 const {clock}=useBillHistory();
 if(!entries.length)return <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center"><h2 className="font-display text-xl">ยังไม่มีบิลในเครื่องนี้</h2><p className="my-3 text-sm text-slate-600">บิลที่สร้างบนเบราว์เซอร์นี้จะแสดงที่นี่</p><Link href="/" className="font-semibold text-[#185c74]">เริ่มสร้างบิล</Link></section>;
 return <div className="space-y-4">{[...entries].sort((a,b)=>(b.kind==="bill"?b.lifecycle.lastActivityAt:b.requestedAt)-(a.kind==="bill"?a.lifecycle.lastActivityAt:a.requestedAt)).map(entry=>{
  if(entry.kind==="deleting")return <article key={entry.localId} className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-display text-lg">กำลังลบบิลและ QR Code</h2><p className="mt-2 text-sm text-slate-600">ลิงก์ถูกปิดแล้ว ระบบจะดำเนินการต่อเมื่อเชื่อมต่อ</p><Button className="mt-3" variant="outline" onClick={onRefresh}>ตรวจสอบอีกครั้ง</Button></article>;
  const [label,color]=statuses[entry.lifecycle.paymentStatus],published=entry.lifecycle.paymentStatus!=="draft",blocked=Boolean(entry.pendingDelete),share=published&&entry.shareUsable&&entry.shareToken;
  const shareUrl=share?"/share/"+encodeURIComponent(entry.shareToken!):"";
  return <article key={entry.localId} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><span className={"inline-block rounded-full px-3 py-1 text-xs font-semibold "+color}>{label}</span><h2 className="mt-3 break-words font-display text-xl font-semibold">{entry.title.trim()||"บิลที่ยังไม่ตั้งชื่อ"}</h2><p className="mt-1 text-xs text-slate-600">ชำระแล้ว {entry.lifecycle.paidCount}/{entry.lifecycle.payerCount} คน</p></div><p className="text-lg font-semibold tabular-nums">{formatBaht(entry.totalSatang)} บาท</p></div><div className="mt-3"><BillExpiry expiresAt={entry.lifecycle.expiresAt} serverClock={clock} syncState={entry.syncState} deadlineSource={entry.deadlineSource}/></div>
  {entry.syncState==="conflict"&&<p className="mt-3 text-sm text-amber-800">ข้อมูลบิลเปลี่ยน กรุณาเปิดตรวจสอบก่อนยืนยันอีกครั้ง</p>}
  {blocked?<div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"><p>รอยืนยันการลบเมื่อเชื่อมต่อ · หยุดการแก้ไขบิลชั่วคราว</p>{entry.syncState==="conflict"&&<div className="mt-2 flex flex-wrap gap-2"><Button variant="outline" onClick={onRefresh}>ตรวจสอบข้อมูลล่าสุด</Button>{entry.editToken&&<Button asChild variant="outline"><Link href={"/edit/"+encodeURIComponent(entry.editToken)}>เปิดตรวจสอบบิล</Link></Button>}<Button variant="outline" onClick={()=>onDelete(entry)}>ยืนยันการลบอีกครั้ง</Button></div>}</div>:<div className="mt-4 flex flex-wrap gap-2">{!published?<Button asChild variant="outline"><Link href={"/history/drafts/"+encodeURIComponent(entry.recordIds.at(-1)??entry.localId)}>ทำต่อ</Link></Button>:<><Button asChild variant="outline"><Link href={"/edit/"+encodeURIComponent(entry.editToken??"")}>แก้ไข</Link></Button>{share?<Button asChild variant="outline"><Link href={shareUrl}>ดูสรุป</Link></Button>:<Button variant="outline" disabled>ดูสรุป</Button>}<CopyButton value={shareUrl&&typeof location!=="undefined"?location.origin+shareUrl:shareUrl} label="คัดลอกลิงก์" disabled={!share}/></>}<Button variant="ghost" onClick={()=>onDelete(entry)} className="text-red-700">ลบบิล</Button></div>}
  {published&&!share&&!blocked&&<p className="mt-3 text-xs text-slate-600">ลิงก์แชร์ในเครื่องนี้ไม่พร้อมใช้งาน</p>}</article>;
 })}</div>;
}
