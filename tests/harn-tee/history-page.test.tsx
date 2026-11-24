// @vitest-environment jsdom
import {afterEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
const fixture=vi.hoisted(()=>({error:null as string|null,entries:[] as unknown[],remove:vi.fn()}));
vi.mock("../../lib/harn-tee/bill-history-provider",async()=>{const {createRetentionClock}=await import("../../lib/harn-tee/retention-clock");return {useBillHistory:()=>({...fixture,loading:false,clock:createRetentionClock(()=>0),refresh:vi.fn()})};});
import HistoryPage from "../../app/history/page";
afterEach(()=>{cleanup();fixture.error=null;fixture.entries=[];fixture.remove.mockClear();});
it("shows_storage_unavailability_and_offline_honestly",()=>{
 fixture.error="storage-unavailable";const {rerender}=render(<HistoryPage/>);expect(screen.getByRole("alert").textContent).toContain("เข้าถึงประวัติในเครื่องไม่ได้");fixture.error="offline";rerender(<HistoryPage/>);expect(screen.getByRole("alert").textContent).toContain("ยังเชื่อมต่อไม่ได้");expect(screen.getByText("ยังไม่มีบิลในเครื่องนี้")).toBeTruthy();
});
it("binds_the_delete_confirmation_to_the_displayed_snapshot",()=>{
 const entry={kind:"bill",schemaVersion:1,localId:"l",recordIds:[],title:"ชื่อบิล",totalSatang:100,lifecycle:{paymentStatus:"unpaid",paidCount:0,payerCount:1,lastActivityAt:1,expiresAt:9999999999999,allPaidAt:null},deadlineSource:"local",localVersion:3,syncState:"synced",shareUsable:false,editToken:"e",revision:"shown"};fixture.entries=[entry];render(<HistoryPage/>);fireEvent.click(screen.getByRole("button",{name:"ลบบิล"}));expect(screen.getByRole("alertdialog").textContent).toContain("ไม่สามารถยกเลิกได้");fixture.entries=[{...entry,revision:"newer",localVersion:4}];fireEvent.click(screen.getByRole("button",{name:"ยืนยันลบบิล"}));expect(fixture.remove).toHaveBeenCalledWith(entry);
});
