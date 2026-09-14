type Step = {
  label: string;
  caption: string;
};

const steps: Step[] = [
  { label: "รายชื่อ", caption: "ใครอยู่ในบิลนี้" },
  { label: "รายการ", caption: "ใครจ่ายอะไร" },
  { label: "ตรวจสอบ", caption: "พร้อมแชร์หรือยัง" },
];

export function Stepper({ current }: { current: number }) {
  return (
    <nav aria-label="ขั้นตอนการสร้างบิล" className="flex items-center gap-2 sm:gap-3">
      {steps.map((step, index) => {
        const isCurrent = index === current;
        const isDone = index < current;
        return (
          <div className="flex min-w-0 flex-1 items-center gap-2" key={step.label}>
            <div
              className={[
                "grid h-9 w-9 shrink-0 place-items-center rounded-full border text-sm font-bold transition",
                isCurrent
                  ? "border-[#ef6c4d] bg-[#ef6c4d] text-white shadow-[0_6px_16px_rgb(239_108_77/24%)]"
                  : isDone
                    ? "border-[#173f35] bg-[#173f35] text-white"
                    : "border-[#d9e2d9] bg-white text-[#809087]",
              ].join(" ")}
            >
              {isDone ? "✓" : index + 1}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-[#21443a]">{step.label}</p>
              <p className="hidden truncate text-xs text-[#809087] sm:block">{step.caption}</p>
            </div>
            {index < steps.length - 1 ? (
              <span
                aria-hidden="true"
                className={[
                  "ml-auto h-px min-w-3 flex-1",
                  isDone ? "bg-[#173f35]" : "bg-[#d9e2d9]",
                ].join(" ")}
              />
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
