// @vitest-environment jsdom
import {afterEach,expect,it} from "vitest";
import {cleanup,render,screen,within} from "@testing-library/react";
import {LiveBillTotals} from "../../components/harn-tee/live-bill-totals";
import {draftFixture} from "../helpers/draft-fixtures";
afterEach(cleanup);
it("labels receipt and rounded collected totals separately and warns about missing payers",()=>{
 const form=draftFixture();form.draft.items[0].payerIds=[];const {rerender}=render(<LiveBillTotals form={form}/>);
 const region=screen.getByRole("region",{name:"ยอดล่าสุด"});expect(within(region).getByText("ยอดรวมตามใบเสร็จ")).toBeTruthy();expect(within(region).getByText(/ยังไม่ได้เลือกผู้ร่วมจ่าย/)).toBeTruthy();
 form.draft.participants=[0,1,2].map(i=>({id:`p${i}`,name:`คน ${i}`,order:i}));form.draft.items[0].payerIds=["p0","p1","p2"];rerender(<LiveBillTotals form={form}/>);
 expect(screen.getByText("100.02 บาท")).toBeTruthy();expect(screen.getByText(/ยอดเรียกเก็บหลังปัดเศษ/)).toBeTruthy();
});
