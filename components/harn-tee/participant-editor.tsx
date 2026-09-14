import { Plus, Trash2, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ParticipantDraft } from "@/lib/harn-tee/types";

export function ParticipantEditor({
  title,
  participants,
  onChange,
  onAdd,
  onRemove,
}: {
  title: string;
  participants: ParticipantDraft[];
  onChange: (id: string, name: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <Card className="border-[#dfe8df] bg-white/85 shadow-[0_22px_60px_rgb(32_67_56/7%)]">
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <div className="mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-[#eaf3e8] text-[#2e6655]">
            <UsersRound size={21} />
          </div>
          <CardTitle className="font-display text-2xl text-[#1c4036]">{title}</CardTitle>
          <p className="mt-1 text-sm text-[#6d8176]">
            มีคนเดียวก็สร้างบิลได้ เผื่อฝากซื้อของตัวเอง
          </p>
        </div>
        <span className="rounded-full bg-[#f7eee4] px-3 py-1 text-xs font-semibold text-[#a55d3c]">
          {participants.length} คน
        </span>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          {participants.map((participant, index) => (
            <div className="flex items-center gap-2" key={participant.id}>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#f3f7f0] text-sm font-bold text-[#547167]">
                {index + 1}
              </span>
              <Input
                aria-label={"ชื่อคนที่ " + (index + 1)}
                value={participant.name}
                onChange={(event) => onChange(participant.id, event.target.value)}
                placeholder={index === 0 ? "เช่น มิน" : "ชื่อเพื่อน"}
                className="h-11 rounded-xl border-[#dfe8df] bg-[#fbfdf9] text-base"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={"ลบ " + (participant.name || "คนที่ " + (index + 1))}
                disabled={participants.length === 1}
                onClick={() => onRemove(participant.id)}
                className="h-10 w-10 shrink-0 rounded-xl text-[#a36a5a] hover:bg-[#fff1ec] hover:text-[#c54f3b]"
              >
                <Trash2 size={17} />
              </Button>
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={onAdd}
          className="h-11 w-full rounded-xl border-dashed border-[#bdcec1] bg-[#fbfdf9] text-[#315f50] hover:bg-[#eef7eb]"
        >
          <Plus size={17} />
          เพิ่มคน
        </Button>
      </CardContent>
    </Card>
  );
}
