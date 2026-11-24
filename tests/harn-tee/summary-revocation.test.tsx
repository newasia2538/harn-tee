// @vitest-environment jsdom
import {afterEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {SummaryClient} from "../../app/summary-client";
import {buildBillDocument} from "../../db/document";
import {draftFixture} from "../helpers/draft-fixtures";
vi.mock("next/image",()=>({default:(props:React.ImgHTMLAttributes<HTMLImageElement>)=><img {...props}/>}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const bill=()=>buildBillDocument(draftFixture().draft,1,"published");
for(const source of ["refresh","payment","unmask","qr"] as const)it(`clears_private_summary_on_${source}_gone`,async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(Response.json({id:"b",access:"share",document:bill(),payment:{qrAvailable:true}})).mockResolvedValue(Response.json({code:"bill-deleted"},{status:410}));vi.stubGlobal("fetch",fetcher);
 render(<SummaryClient token="s"/>);await screen.findByText("ทดสอบดราฟต์");
 if(source==="refresh")fireEvent.click(screen.getByRole("button",{name:/รีเฟรช/}));
 else if(source==="payment")fireEvent.click(screen.getByRole("button",{name:"ฉันจ่ายแล้ว"}));
 else if(source==="unmask")fireEvent.click(screen.getByRole("button",{name:"แสดงเลขบัญชี"}));
 else{fireEvent.click(screen.getByRole("button",{name:"แสดง QR สำหรับโอน"}));fireEvent.error(screen.getByRole("img",{name:"QR สำหรับรับเงิน"}));}
 await waitFor(()=>expect(screen.getByRole("heading",{name:"บิลนี้ได้ถูกลบออกจากระบบแล้ว"})).toBeTruthy());expect(screen.queryByText("ทดสอบดราฟต์")).toBeNull();expect(screen.queryByText("โอนคืนให้ ผู้รับ")).toBeNull();expect(screen.queryByRole("img",{name:"QR สำหรับรับเงิน"})).toBeNull();
});
it("does_not_call_a_temporary_network_error_a_deleted_bill",async()=>{
 vi.stubGlobal("fetch",vi.fn().mockRejectedValue(new Error("offline")));render(<SummaryClient token="s"/>);await screen.findByText("offline");expect(screen.queryByText("บิลนี้ได้ถูกลบออกจากระบบแล้ว")).toBeNull();
});
