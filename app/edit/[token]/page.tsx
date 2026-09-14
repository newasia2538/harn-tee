"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { HarnTeeApp } from "../../harn-tee-client";
import type { BillDocument } from "@/lib/harn-tee/types";

export default function EditPage() {
  const params = useParams<{ token: string }>();
  const [document, setDocument] = useState<BillDocument | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch("/api/bills/" + params.token, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json() as { document?: BillDocument; error?: string };
        if (!response.ok || !body.document) throw new Error(body.error ?? "ไม่พบข้อมูลบิลนี้");
        setDocument(body.document);
      })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "โหลดบิลไม่สำเร็จ"));
  }, [params.token]);

  if (error) {
    return <main className="grid min-h-screen place-items-center p-6 text-center text-[#315f50]"><div><h1 className="font-display text-3xl">{error}</h1><Link className="mt-5 inline-block text-sm font-bold text-[#d36346]" href="/">สร้างบิลใหม่</Link></div></main>;
  }
  if (!document) return <main className="grid min-h-screen place-items-center p-6 text-[#315f50]">กำลังโหลดบิล...</main>;
  return <HarnTeeApp initialDocument={document} editToken={params.token} />;
}
