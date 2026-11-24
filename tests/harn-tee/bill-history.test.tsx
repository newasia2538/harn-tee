// @vitest-environment jsdom
import {afterEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {BillHistoryList} from "../../components/harn-tee/bill-history-list";
import type {ActiveHistoryEntry} from "../../lib/harn-tee/history-state";
afterEach(cleanup);
const entry=(status:ActiveHistoryEntry["lifecycle"]["paymentStatus"],n=0):ActiveHistoryEntry=>({kind:"bill",schemaVersion:1,localId:"l"+n,recordIds:[],billId:status==="draft"?undefined:"b"+n,editToken:"secret-e"+n,shareToken:"s"+n,revision:"r",title:n?"บิล "+n:"",totalSatang:12345,lifecycle:{lastActivityAt:n,allPaidAt:null,expiresAt:9999999999999,paymentStatus:status,paidCount:status==="partial"?1:status==="paid"?2:0,payerCount:2},deadlineSource:"local",localVersion:0,syncState:"synced",shareUsable:true});
it("shows_four_statuses_sorted_summaries_and_matching_actions",()=>{
 render(<BillHistoryList entries={[entry("draft"),entry("unpaid",1),entry("partial",2),entry("paid",3)]} onDelete={vi.fn()} onRefresh={vi.fn()}/>);
 for(const name of ["ดราฟต์","รอชำระ","ชำระบางส่วน","ชำระครบแล้ว","บิลที่ยังไม่ตั้งชื่อ"])expect(screen.getByText(name)).toBeTruthy();expect(screen.getAllByText("123.45 บาท")).toHaveLength(4);expect(screen.getByText("ชำระแล้ว 1/2 คน")).toBeTruthy();expect(screen.getAllByRole("article")[0].textContent).toContain("บิล 3");expect(screen.getByRole("link",{name:"ทำต่อ"}).getAttribute("href")).toBe("/history/drafts/l0");expect(screen.getAllByRole("link",{name:"ดูสรุป"})[0].getAttribute("href")).toBe("/share/s3");expect(screen.queryByText(/secret-e/)).toBeNull();
});
it("disables_stale_share_without_removing_owner_edit_and_delete",()=>{
 const remove=vi.fn();render(<BillHistoryList entries={[{...entry("unpaid"),shareUsable:false}]} onDelete={remove} onRefresh={vi.fn()}/>);expect(screen.getByText("ลิงก์แชร์ในเครื่องนี้ไม่พร้อมใช้งาน")).toBeTruthy();expect((screen.getByRole("button",{name:"คัดลอกลิงก์"}) as HTMLButtonElement).disabled).toBe(true);expect(screen.getByRole("link",{name:"แก้ไข"})).toBeTruthy();fireEvent.click(screen.getByRole("button",{name:"ลบบิล"}));expect(remove).toHaveBeenCalledOnce();
});
it("shows_empty_and_minimal_pending_states",()=>{
 const {rerender}=render(<BillHistoryList entries={[]} onDelete={vi.fn()} onRefresh={vi.fn()}/>);expect(screen.getByText("ยังไม่มีบิลในเครื่องนี้")).toBeTruthy();rerender(<BillHistoryList entries={[{kind:"deleting",schemaVersion:1,localId:"l",billId:"b",editToken:"e",revision:"r",localVersion:0,requestedAt:1,syncState:"pending"}]} onDelete={vi.fn()} onRefresh={vi.fn()}/>);expect(screen.getByText("กำลังลบบิลและ QR Code")).toBeTruthy();expect(screen.queryByRole("link",{name:"แก้ไข"})).toBeNull();
});
