"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { HarnTeeApp } from "../../harn-tee-client";
import type {DraftAck} from "@/lib/harn-tee/draft-state";
import {DeletedBillState} from "@/components/harn-tee/deleted-bill-state";
import {createDraftApi,DraftApiError} from "@/lib/harn-tee/draft-api";

export default function EditPage() {
  const params = useParams<{ token: string }>();
  const [loaded, setLoaded] = useState<{token:string;ack:DraftAck} | null>(null);
  const [failure, setFailure] = useState<{token:string;message:string;state?:"deleting"|"deleted"}|null>(null);
  const snapshot=loaded?.token===params.token?loaded.ack:null,error=failure?.token===params.token?failure.message:"";

  useEffect(() => {
    const controller=new AbortController();
    void createDraftApi().load(params.token,controller.signal).then(ack=>{if(!controller.signal.aborted)setLoaded({token:params.token,ack});}).catch(error=>{if(!controller.signal.aborted){setLoaded(null);setFailure({token:params.token,message:"ไม่พบข้อมูลบิลนี้ หรือโหลดบิลไม่สำเร็จ",state:error instanceof DraftApiError&&error.status===410?(error.code==="bill-deleted"?"deleted":"deleting"):undefined});}});
    return ()=>controller.abort();
  }, [params.token]);

  if(failure?.token===params.token&&failure.state)return <DeletedBillState state={failure.state}/>;
  if (error) {
    return <main className="grid min-h-screen place-items-center p-6 text-center text-[#315f50]"><div><h1 className="font-display text-3xl">{error}</h1><Link className="mt-5 inline-block text-sm font-bold text-[#d36346]" href="/">สร้างบิลใหม่</Link></div></main>;
  }
  if (!snapshot) return <main className="grid min-h-screen place-items-center p-6 text-[#315f50]">กำลังโหลดบิล...</main>;
  return <HarnTeeApp key={params.token} initialSnapshot={snapshot} editToken={params.token} />;
}
