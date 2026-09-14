import type { BankOption } from "@/lib/harn-tee/banks";

export function BankMark({ bank, size = "md" }: { bank: BankOption; size?: "sm" | "md" }) {
  const dimension = size === "sm" ? "h-8 w-8 text-[9px]" : "h-10 w-10 text-[10px]";
  return (
    <span className={["relative grid shrink-0 place-items-center overflow-hidden rounded-xl font-black text-white", dimension].join(" ")} style={{ backgroundColor: bank.color }}>
      <span className="absolute inset-0 grid place-items-center">{bank.id === "KBANK" ? "K" : bank.id}</span>
      {/* Remote bank marks intentionally remain unoptimized so a blocked image still leaves the text fallback. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={bank.logoUrl} alt="" aria-hidden="true" className="absolute inset-1 h-[calc(100%-0.5rem)] w-[calc(100%-0.5rem)] object-contain" />
    </span>
  );
}
