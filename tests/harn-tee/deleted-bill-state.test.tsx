// @vitest-environment jsdom
import {afterEach,expect,it} from "vitest";
import {cleanup,render,screen} from "@testing-library/react";
import {DeletedBillState} from "../../components/harn-tee/deleted-bill-state";
afterEach(cleanup);
it("uses_the_approved_exact_copy_and_normal_flow_bottom_home_action",()=>{
 const {container}=render(<DeletedBillState state="deleted"/>);expect(screen.getByRole("heading",{name:"บิลนี้ได้ถูกลบออกจากระบบแล้ว"})).toBeTruthy();expect(screen.getByText("ขออภัย ท่านไม่สามารถดูรายละเอียดหรือแก้ไขบิลนี้ได้อีก")).toBeTruthy();expect(screen.getByText("ข้อมูลบิลและ QR Code สำหรับรับชำระเงินถูกลบออกจากระบบแล้ว")).toBeTruthy();expect(screen.getByRole("link",{name:"กลับสู่หน้าแรก"}).getAttribute("href")).toBe("/");expect(container.querySelector("main")?.className).toContain("deleted-bill-page");expect(document.activeElement).toBe(screen.getByRole("heading"));
});
it("does_not_claim_qr_removal_while_cleanup_is_pending",()=>{
 render(<DeletedBillState state="deleting"/>);expect(screen.getByText("กำลังลบบิลและ QR Code")).toBeTruthy();expect(screen.queryByText("ข้อมูลบิลและ QR Code สำหรับรับชำระเงินถูกลบออกจากระบบแล้ว")).toBeNull();
});
