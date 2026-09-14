import { Check, ExternalLink, LockKeyhole, Share2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyButton } from "./copy-button";

export function LinkPanel({ shareUrl, editUrl }: { shareUrl: string; editUrl: string }) {
  return (
    <Card className="border-[#c9decd] bg-[#f6fbf4] shadow-[0_22px_60px_rgb(32_67_56/8%)]">
      <CardHeader className="space-y-1">
        <Badge className="w-fit bg-[#dfeee0] text-[#35644f] hover:bg-[#dfeee0]">
          <Check size={13} />
          สร้างบิลเรียบร้อย
        </Badge>
        <CardTitle className="font-display pt-1 text-3xl text-[#1c4036]">แชร์ให้เพื่อนได้เลย</CardTitle>
        <p className="text-sm text-[#668074]">เก็บลิงก์แก้ไขไว้กับตัวเอง อย่าส่งต่อให้คนอื่น</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-2xl border border-[#dbead9] bg-white p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-bold text-[#315f50]">
            <Share2 size={16} />
            ลิงก์ดูผลสรุป
          </div>
          <p className="mb-3 break-all text-xs text-[#7c9085]">{shareUrl}</p>
          <div className="flex flex-wrap gap-2">
            <CopyButton value={shareUrl} label="คัดลอกลิงก์ดู" />
            <Button asChild size="sm" className="h-9 rounded-xl bg-[#2f7256] hover:bg-[#265d48]">
              <a href={shareUrl}>
                เปิดหน้าสรุป
                <ExternalLink size={14} />
              </a>
            </Button>
          </div>
        </div>
        <div className="rounded-2xl border border-[#eadfd2] bg-[#fffaf4] p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-bold text-[#9a654a]">
            <LockKeyhole size={16} />
            ลิงก์แก้ไขสำหรับ Admin
          </div>
          <p className="mb-3 break-all text-xs text-[#8d8076]">{editUrl}</p>
          <CopyButton value={editUrl} label="คัดลอกลิงก์แก้ไข" />
        </div>
      </CardContent>
    </Card>
  );
}
