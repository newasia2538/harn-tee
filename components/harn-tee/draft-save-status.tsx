import {useState} from "react";
import {Button} from "@/components/ui/button";
import type {SaveState} from "@/lib/harn-tee/draft-state";
const labels:Record<SaveState["status"],string>={idle:"ยังไม่ได้บันทึก",pending:"รอบันทึก",saving:"กำลังบันทึก…",saved:"บันทึกแล้ว",error:"บันทึกไม่สำเร็จ",conflict:"มีข้อมูลใหม่จากอีกหน้าหรืออีกเครื่อง"};
export function DraftSaveStatus({local,remote,onRetry,onLoadLatest}:{local:SaveState;remote:SaveState;onRetry:()=>void;onLoadLatest:()=>void}){
 const [confirm,setConfirm]=useState(false),conflict=local.status==="conflict"||remote.status==="conflict";
 const line=(label:string,s:SaveState)=><p>{label}: {labels[s.status]}{s.status==="saved"&&s.savedAt&&<time className="ml-1" dateTime={new Date(s.savedAt).toISOString()}>{new Date(s.savedAt).toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit"})}</time>}</p>;
 return <section aria-label="สถานะการบันทึก" className="mt-4 space-y-2 rounded-xl border border-[#d9e3ec] bg-white p-4 text-sm text-[#40566b]">
  <div role="status">{line("ในเบราว์เซอร์นี้",local)}{remote.status!=="idle"&&line("ผ่านลิงก์แก้ไข",remote)}</div>
  <p className="text-xs leading-5">ดราฟต์เก็บในเบราว์เซอร์นี้ ผู้ใช้เครื่องเดียวกันอาจเข้าถึงได้ ใช้ลิงก์แก้ไขเพื่อทำต่อบนเครื่องอื่น และเก็บลิงก์ไว้เป็นส่วนตัว</p>
  {!conflict&&(local.status==="error"||remote.status==="error")&&<Button size="sm" variant="outline" onClick={onRetry}>ลองบันทึกอีกครั้ง</Button>}
  {conflict&&<p>ข้อมูลที่คุณกรอกยังอยู่ กรุณาเก็บข้อมูลที่ต้องการก่อนโหลดข้อมูลล่าสุด</p>}
  {conflict&&!confirm&&<Button size="sm" variant="outline" onClick={()=>setConfirm(true)}>โหลดข้อมูลล่าสุด</Button>}
  {confirm&&<div className="space-y-2"><p>การโหลดจะใช้ข้อมูลล่าสุดแทนข้อมูลที่กำลังแก้ในเครื่องนี้</p><Button size="sm" onClick={()=>{onLoadLatest();setConfirm(false);}}>ยืนยันโหลดข้อมูลล่าสุด</Button><Button size="sm" variant="ghost" onClick={()=>setConfirm(false)}>ยกเลิก</Button></div>}
 </section>;
}
