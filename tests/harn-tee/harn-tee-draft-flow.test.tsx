// @vitest-environment jsdom
import {afterEach,expect,it,vi} from "vitest";
import {act,cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {HarnTeeApp} from "../../app/harn-tee-client";
import {checkpoint,sessionFixtures} from "../helpers/draft-session-fixtures";
vi.mock("next/navigation",()=>({useRouter:()=>({push:vi.fn()})}));
/* Image props are deliberately stripped by this test-only native element. */
/* eslint-disable @typescript-eslint/no-unused-vars, @next/next/no-img-element, jsx-a11y/alt-text */
vi.mock("next/image",()=>({default:({fill,priority,...props}:Record<string,unknown>)=><img {...props}/>}));
/* eslint-enable @typescript-eslint/no-unused-vars, @next/next/no-img-element, jsx-a11y/alt-text */
vi.mock("next/link",()=>({default:({children,...props}:React.AnchorHTMLAttributes<HTMLAnchorElement>)=><a {...props}>{children}</a>}));
afterEach(cleanup);
it("has_one_next_action_only_on_item_step",async()=>{
 const saved=checkpoint();saved.form.step=1;render(<HarnTeeApp sessionDependencies={sessionFixtures(saved)}/>);
 fireEvent.click(await screen.findByRole("button",{name:"ทำรายการต่อ"}));
 await screen.findByRole("button",{name:"ตรวจสอบบิล"});
 expect(screen.getAllByRole("button",{name:"ตรวจสอบบิล"})).toHaveLength(1);
 expect(screen.queryByRole("button",{name:"ตรวจสอบยอด"})).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:"ตรวจสอบบิล"}));
 await screen.findByText("ตรวจสอบก่อนแชร์");expect(screen.queryByRole("region",{name:"ยอดล่าสุด"})).toBeNull();
});
it("invalid_form_keeps_item_step_and_notices_reachable",async()=>{
 const saved=checkpoint();saved.form.step=1;saved.form.draft.items[0].name="";
 render(<HarnTeeApp sessionDependencies={sessionFixtures(saved)}/>);
 fireEvent.click(await screen.findByRole("button",{name:"ทำรายการต่อ"}));
 fireEvent.click(await screen.findByRole("button",{name:"ตรวจสอบบิล"}));
 expect(await screen.findByRole("alert")).toBeTruthy();expect(screen.getByRole("region",{name:"ยอดล่าสุด"})).toBeTruthy();
 expect(screen.queryByText("ตรวจสอบก่อนแชร์")).toBeNull();
});
it("bar_unmounts_on_recovery_completion_and_submission_guards",async()=>{
 const saved=checkpoint();saved.form.step=1;const fx=sessionFixtures(saved);render(<HarnTeeApp sessionDependencies={fx}/>);
 await screen.findByRole("button",{name:"ทำรายการต่อ"});expect(screen.queryByRole("region",{name:"ยอดล่าสุด"})).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:"ทำรายการต่อ"}));await screen.findByRole("region",{name:"ยอดล่าสุด"});
 await act(async()=>{});const writes=vi.mocked(fx.store.writeWorking).mock.calls.length;
 fireEvent.click(screen.getByRole("button",{name:/ยอดล่าสุด/}));await act(async()=>{});
 expect(vi.mocked(fx.store.writeWorking).mock.calls).toHaveLength(writes);
 fireEvent.click(screen.getByRole("button",{name:"ตรวจสอบบิล"}));
 fireEvent.click(await screen.findByRole("button",{name:"ยืนยันและสร้างลิงก์แชร์"}));
 expect(screen.queryByRole("region",{name:"ยอดล่าสุด"})).toBeNull();
 await screen.findByText("แชร์ให้เพื่อนได้เลย");expect(screen.queryByRole("button",{name:"ตรวจสอบบิล"})).toBeNull();
});
it("removes numeric inputs together with a deleted item before publishing",async()=>{
 const saved=checkpoint();saved.form.step=1;saved.form.draft.items.push({...saved.form.draft.items[0],id:"i2",name:"ลบทิ้ง",order:1});saved.form.numbers.prices.i2="50";saved.form.numbers.itemVat.i2="7";saved.form.numbers.itemService.i2="10";
 const fx=sessionFixtures(saved);render(<HarnTeeApp sessionDependencies={fx}/>);fireEvent.click(await screen.findByRole("button",{name:"ทำรายการต่อ"}));fireEvent.click(await screen.findByRole("button",{name:"ลบ ลบทิ้ง"}));
 fireEvent.click(screen.getByRole("button",{name:/ตรวจสอบบิล/}));fireEvent.click(await screen.findByRole("button",{name:"ยืนยันและสร้างลิงก์แชร์"}));await screen.findByText("แชร์ให้เพื่อนได้เลย");
 const form=vi.mocked(fx.api.publish).mock.calls[0][2];expect(form.numbers.prices).not.toHaveProperty("i2");expect(form.numbers.itemVat).not.toHaveProperty("i2");expect(form.numbers.itemService).not.toHaveProperty("i2");
});
it("resumes step, raw input and payment data after remount",async()=>{
 const saved=checkpoint();saved.form.step=1;saved.form.numbers.prices.i1="7.";const fx=sessionFixtures(saved);
 render(<HarnTeeApp sessionDependencies={fx}/>);
 await screen.findByRole("button",{name:"ทำรายการต่อ"});expect(fx.store.writeWorking).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button",{name:"ทำรายการต่อ"}));await screen.findByRole("region",{name:"ยอดล่าสุด"});
 expect((screen.getByLabelText("ราคาของรายการที่ 1") as HTMLInputElement).value).toBe("7.");expect(screen.getByDisplayValue("1234567890")).toBeTruthy();
 fireEvent.change(screen.getByLabelText("ราคาของรายการที่ 1"),{target:{value:"100"}});
 await waitFor(()=>expect(fx.stored?.kind==="working"&&fx.stored.form.numbers.prices.i1).toBe("100"));cleanup();
 render(<HarnTeeApp sessionDependencies={fx}/>);fireEvent.click(await screen.findByRole("button",{name:"ทำรายการต่อ"}));
 expect((await screen.findByLabelText("ราคาของรายการที่ 1") as HTMLInputElement).value).toBe("100");
});
it("publishes once, restores the receipt, and starts a blank next bill without deleting the old bill",async()=>{
 const saved=checkpoint();saved.form.step=2;const fx=sessionFixtures(saved);render(<HarnTeeApp sessionDependencies={fx}/>);
 fireEvent.click(await screen.findByRole("button",{name:"ทำรายการต่อ"}));fireEvent.click(await screen.findByRole("button",{name:"ยืนยันและสร้างลิงก์แชร์"}));
 await waitFor(()=>expect(screen.queryByText("แชร์ให้เพื่อนได้เลย"),screen.queryByRole("alert")?.textContent??"waiting").toBeTruthy());expect(fx.api.publish).toHaveBeenCalledOnce();cleanup();
 render(<HarnTeeApp sessionDependencies={fx}/>);await screen.findByText("แชร์ให้เพื่อนได้เลย");expect(fx.api.publish).toHaveBeenCalledOnce();
 fireEvent.click(screen.getByRole("button",{name:"เริ่มทำรายการใหม่"}));expect(screen.getByText(/เก็บลิงก์แก้ไขบิลเดิมไว้ก่อนนะ/)).toBeTruthy();fireEvent.click(screen.getByRole("button",{name:"เก็บลิงก์แล้ว เริ่มบิลใหม่"}));
 await screen.findByText("ใครอยู่ในบิลนี้บ้าง?");expect(screen.queryByDisplayValue("1234567890")).toBeNull();expect(screen.queryByDisplayValue("เอ")).toBeNull();expect(fx.api.publish).toHaveBeenCalledOnce();
});
it("requires confirmation before discarding an unfinished local draft",async()=>{
 const fx=sessionFixtures(checkpoint());render(<HarnTeeApp sessionDependencies={fx}/>);fireEvent.click(await screen.findByRole("button",{name:"เริ่มใหม่"}));
 expect(fx.store.startNew).not.toHaveBeenCalled();fireEvent.click(screen.getByRole("button",{name:"ยืนยันเริ่มใหม่"}));await waitFor(()=>expect(fx.store.startNew).toHaveBeenCalledOnce());
});
it("keeps published edits local until save and retains preview afterward",async()=>{
 const fx=sessionFixtures();fx.setAck({...fx.ack,document:{...fx.ack.document,status:"published"},form:undefined});
 render(<HarnTeeApp editToken="edit" initialSnapshot={fx.ack} sessionDependencies={fx}/>);
 const title=await screen.findByLabelText("ชื่อบิล (ใส่หรือไม่ก็ได้)");fireEvent.change(title,{target:{value:"แก้ในเครื่อง"}});
 await waitFor(()=>expect(fx.stored?.kind==="working"&&fx.stored.form.draft.title).toBe("แก้ในเครื่อง"));expect(fx.api.save).not.toHaveBeenCalled();expect(fx.api.publish).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button",{name:/ไปใส่รายการสินค้า/}));fireEvent.click(await screen.findByRole("button",{name:/ตรวจสอบบิล/}));fireEvent.click(await screen.findByRole("button",{name:"บันทึกการแก้ไข"}));
 await screen.findByText(/บันทึกการแก้ไขแล้ว/);expect(screen.getByText("ตรวจสอบก่อนแชร์")).toBeTruthy();expect(fx.api.publish).toHaveBeenCalledOnce();
});
it("requires copy and acknowledgment before confirming without working browser storage",async()=>{
 const saved=checkpoint();saved.form.step=2;const fx=sessionFixtures(saved);vi.mocked(fx.store.writeWorking).mockRejectedValue(new Error("quota"));vi.mocked(fx.store.writeCompletion).mockRejectedValue(new Error("quota"));
 Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:vi.fn(async()=>undefined)}});
 render(<HarnTeeApp sessionDependencies={fx}/>);fireEvent.click(await screen.findByRole("button",{name:"ทำรายการต่อ"}));fireEvent.click(await screen.findByRole("button",{name:"ยืนยันและสร้างลิงก์แชร์"}));
 const copy=await screen.findByRole("button",{name:"คัดลอกลิงก์กู้คืน"});expect(fx.api.publish).not.toHaveBeenCalled();const ack=screen.getByLabelText("ฉันเก็บลิงก์กู้คืนแล้ว") as HTMLInputElement;expect(ack.disabled).toBe(true);
 fireEvent.click(copy);await waitFor(()=>expect(ack.disabled).toBe(false));fireEvent.click(ack);fireEvent.click(screen.getByRole("button",{name:"ยืนยันและสร้างลิงก์แชร์"}));
 await screen.findByText("แชร์ให้เพื่อนได้เลย");expect(fx.api.publish).toHaveBeenCalledOnce();expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining("/edit/edit"));
});
it("keeps the recovered national ID empty and requires reentry",async()=>{
 const saved=checkpoint();saved.form.step=1;saved.form.draft.recipient!.promptPay={type:"national-id",value:""};saved.form.paymentReentryRequired=true;
 render(<HarnTeeApp sessionDependencies={sessionFixtures(saved)}/>);fireEvent.click(await screen.findByRole("button",{name:"ทำรายการต่อ"}));
 expect((await screen.findByLabelText("เลข PromptPay") as HTMLInputElement).value).toBe("");fireEvent.click(screen.getByRole("button",{name:/ตรวจสอบบิล/}));expect(await screen.findByRole("alert")).toHaveProperty("textContent","เลขบัตรประชาชนต้องมี 13 หลัก");
});
