"use client";

import { useParams } from "next/navigation";
import { SummaryClient } from "../../summary-client";

export default function SharePage() {
  const params = useParams<{ token: string }>();
  return <SummaryClient token={params.token} />;
}
