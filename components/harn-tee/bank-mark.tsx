import type { BankOption } from "@/lib/harn-tee/banks";

export function BankMark({ bank, size = "md" }: { bank: BankOption; size?: "sm" | "md" }) {
  const dimension = size === "sm" ? "h-8 w-8" : "h-10 w-10";
  return (
    <span role="img" aria-label={bank.name} className={["relative grid shrink-0 place-items-center overflow-hidden rounded-xl", dimension].join(" ")} style={{ backgroundColor: bank.color }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={bank.logoUrl} alt="" aria-hidden="true" className="absolute inset-1 h-[calc(100%-0.5rem)] w-[calc(100%-0.5rem)] object-contain" />
    </span>
  );
}
