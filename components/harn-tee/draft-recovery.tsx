import {useState} from "react";
import {Button} from "@/components/ui/button";
import type {WorkingCheckpoint} from "@/lib/harn-tee/draft-state";
export function DraftRecovery({candidate,onResume,onStartFresh}:{candidate:WorkingCheckpoint;onResume:()=>void;onStartFresh:()=>void}){
 const [confirm,setConfirm]=useState(false);
 return <section aria-label="กู้ดราฟต์" className="mt-8 space-y-4 rounded-2xl border border-[#cbd8e5] bg-white p-6 text-[#243b53]">
  <h1 className="font-display text-2xl font-bold">มีบิลที่ยังทำไม่เสร็จ</h1>
  <p>ทำต่อจากขั้นตอนล่าสุดได้ ข้อมูลอยู่ในเบราว์เซอร์นี้</p>
  <p className="break-words text-sm">{candidate.form.draft.title||"บิลที่ยังไม่ตั้งชื่อ"} · {candidate.form.draft.items.length} รายการ</p>
  {candidate.form.paymentReentryRequired&&<p className="text-sm text-[#79521e]">ต้องกรอกเลขประชาชน PromptPay ใหม่ก่อนยืนยันบิล</p>}
  {confirm?<div className="space-y-3 rounded-xl bg-[#fff5df] p-4"><p>ดราฟต์ในเครื่องนี้จะถูกแทนที่ด้วยบิลใหม่ บิลที่แชร์ไปแล้วจะยังอยู่</p><Button onClick={onStartFresh}>ยืนยันเริ่มใหม่</Button><Button variant="ghost" onClick={()=>setConfirm(false)}>ยกเลิก</Button></div>:<div className="flex flex-wrap gap-2"><Button onClick={onResume}>ทำรายการต่อ</Button><Button variant="outline" onClick={()=>setConfirm(true)}>เริ่มใหม่</Button></div>}
 </section>;
}
