"use client";
import {useEffect,useState} from "react";
import {remainingBillTime,type createRetentionClock} from "@/lib/harn-tee/retention-clock";
import type {HistoryEntry} from "@/lib/harn-tee/history-state";
export function BillExpiry({expiresAt,serverClock,syncState,deadlineSource}:{expiresAt:number;serverClock:ReturnType<typeof createRetentionClock>;syncState:HistoryEntry["syncState"];deadlineSource:"local"|"server"}){
 const [now,setNow]=useState(()=>deadlineSource==="local"?Date.now():serverClock.now());
 useEffect(()=>{const timer=setInterval(()=>setNow(deadlineSource==="local"?Date.now():serverClock.now()),1000);return ()=>clearInterval(timer);},[deadlineSource,serverClock]);
 if(syncState==="offline")return <p className="text-xs text-amber-800">รอตรวจสอบเมื่อเชื่อมต่อ</p>;
 const remaining=now===null?null:remainingBillTime(expiresAt,now);
 if(!remaining||remaining.kind==="expired")return <p className="text-xs text-amber-800">กำลังตรวจสอบวันหมดอายุ</p>;
 return <p className={remaining.kind==="countdown"?"text-xs font-semibold text-amber-800":"text-xs text-slate-600"}>{remaining.kind==="days"?`เหลือ ${remaining.days} วัน`:<>หมดอายุใน <span className="font-mono tabular-nums">{remaining.text}</span></>}{deadlineSource==="local"&&<span> · เวลาในเครื่องนี้</span>}</p>;
}
