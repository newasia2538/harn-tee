"use client";
import {useState} from "react";
import Link from "next/link";
import {BillHistoryList} from "@/components/harn-tee/bill-history-list";
import {Button} from "@/components/ui/button";
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from "@/components/ui/alert-dialog";
import {useBillHistory} from "@/lib/harn-tee/bill-history-provider";
import type {HistoryEntry} from "@/lib/harn-tee/history-state";
export default function HistoryPage(){
 const {entries,loading,error,refresh,remove}=useBillHistory(),[candidate,setCandidate]=useState<HistoryEntry|null>(null),[busy,setBusy]=useState(false),[failure,setFailure]=useState("");
 const confirm=async()=>{if(!candidate)return;setBusy(true);setFailure("");try{await remove(candidate);setCandidate(null);}catch{setFailure("ข้อมูลเปลี่ยนหรือบันทึกไม่ได้ กรุณารีเฟรชและตรวจสอบอีกครั้ง");}finally{setBusy(false);}};
 return <main className="mx-auto min-h-screen max-w-3xl px-4 py-6 text-[#15263d] sm:px-6"><header className="mb-8 flex flex-wrap items-center justify-between gap-3"><Link href="/" className="font-display text-xl font-bold">harn-tee · หารที</Link><Link href="/" className="text-sm font-semibold text-[#185c74]">สร้างบิลใหม่</Link></header><div className="mb-6 flex items-center justify-between gap-3"><h1 className="font-display text-3xl font-semibold">บิลของฉัน</h1><Button variant="outline" onClick={()=>void refresh()}>รีเฟรช</Button></div><p className="mb-5 text-sm leading-6 text-slate-600">ประวัติเฉพาะบิลที่สร้างบนเบราว์เซอร์นี้ บิลทั่วไปมีอายุ 30 วันหลังอัปเดตล่าสุด และ 7 วันหลังทุกคนชำระครบ</p>
 {error==="storage-unavailable"?<p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">เข้าถึงประวัติในเครื่องไม่ได้ โปรดอนุญาตการจัดเก็บข้อมูลในเบราว์เซอร์แล้วลองใหม่</p>:<>{error==="offline"&&<p role="alert" className="mb-4 text-sm text-amber-800">ยังเชื่อมต่อไม่ได้ แสดงข้อมูลล่าสุดในเครื่อง</p>}{loading?<p>กำลังโหลดประวัติ…</p>:<BillHistoryList entries={entries} onDelete={setCandidate} onRefresh={()=>void refresh()}/>}</>}
 <AlertDialog open={Boolean(candidate)} onOpenChange={open=>{if(!open&&!busy)setCandidate(null);}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>ยืนยันลบบิล</AlertDialogTitle><AlertDialogDescription>ต้องการลบ “{candidate?.kind==="bill"?candidate.title||"บิลที่ยังไม่ตั้งชื่อ":"บิลนี้"}” หรือไม่? ข้อมูลบิลและ QR Code จะถูกลบ ลิงก์แชร์และลิงก์แก้ไขจะใช้ไม่ได้ การดำเนินการนี้ไม่สามารถยกเลิกได้</AlertDialogDescription></AlertDialogHeader>{failure&&<p role="alert" className="text-sm text-red-700">{failure}</p>}<AlertDialogFooter><AlertDialogCancel disabled={busy}>ยกเลิก</AlertDialogCancel><AlertDialogAction disabled={busy||Boolean(candidate?.kind==="bill"&&candidate.billId&&!candidate.revision)} onClick={event=>{event.preventDefault();void confirm();}} className="bg-red-700 text-white hover:bg-red-800">{busy?"กำลังดำเนินการ…":"ยืนยันลบบิล"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 </main>;
}
