// @vitest-environment jsdom
import {afterEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,within} from "@testing-library/react";
import {LiveBillTotals} from "../../components/harn-tee/live-bill-totals";
import {setNumericInput} from "../../lib/harn-tee/draft-state";
import {useState} from "react";
import {draftFixture} from "../helpers/draft-fixtures";
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});

it("expands_from_total_and_preserves_receipt_vs_collection_labels",()=>{
  const form=draftFixture();
  form.draft.participants=[0,1,2].map(i=>({id:`p${i}`,name:`คน ${i}`,order:i}));
  form.draft.items[0].payerIds=["p0","p1","p2"];
  render(<LiveBillTotals form={form} onNext={()=>undefined}/>);
  const toggle=screen.getByRole("button",{name:/ยอดล่าสุด/});
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(toggle.textContent).toContain("100.00 บาท");
  expect(screen.queryByRole("group",{name:"รายละเอียดค่าบริการและภาษี"})).toBeNull();
  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  const details=screen.getByRole("group",{name:"รายละเอียดค่าบริการและภาษี"});
  expect(within(details).getByText("ยอดรวมตามใบเสร็จ")).toBeTruthy();
  expect(within(details).getByText("100.02 บาท")).toBeTruthy();
  expect(within(details).getByText(/ยอดเรียกเก็บหลังปัดเศษ/)).toBeTruthy();
  fireEvent.click(toggle);
  expect(screen.queryByRole("group",{name:"รายละเอียดค่าบริการและภาษี"})).toBeNull();
});
it("uses_existing_fee_calculations",()=>{
  const form=draftFixture();form.draft.vatPercent=7;form.draft.serviceChargePercent=10;
  const {rerender}=render(<LiveBillTotals form={form} onNext={()=>undefined}/>);
  expect(screen.getByRole("button",{name:/ยอดล่าสุด/}).textContent).toContain("117.70 บาท");
  form.draft.calculationMode="separate";rerender(<LiveBillTotals form={form} onNext={()=>undefined}/>);
  expect(screen.getByRole("button",{name:/ยอดล่าสุด/}).textContent).toContain("117.00 บาท");
  form.draft.feeMode="item";form.draft.items[0].vatPercent=5;form.draft.items[0].serviceChargePercent=0;
  rerender(<LiveBillTotals form={form} onNext={()=>undefined}/>);
  expect(screen.getByRole("button",{name:/ยอดล่าสุด/}).textContent).toContain("105.00 บาท");
});
it("shows_unassigned_and_provisional_notices_without_hiding_next_action",()=>{
  const form=setNumericInput(draftFixture(),{kind:"price",itemId:"i1"},"7.");
  form.draft.items[0].payerIds=[];const onNext=vi.fn();
  render(<LiveBillTotals form={form} onNext={onNext}/>);
  expect(screen.getByText(/ยังไม่ได้เลือกผู้ร่วมจ่าย 1 รายการ/)).toBeTruthy();
  expect(screen.getByText(/ยอดชั่วคราว/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:"ตรวจสอบบิล"}));expect(onNext).toHaveBeenCalledOnce();
});
it("next_action_calls_owner_handler_once_and_obeys_submission_disable",()=>{
  const form=draftFixture(),onNext=vi.fn();
  const {rerender}=render(<LiveBillTotals form={form} onNext={onNext}/>);
  fireEvent.click(screen.getByRole("button",{name:/ยอดล่าสุด/}));expect(onNext).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"ตรวจสอบบิล"}));expect(onNext).toHaveBeenCalledOnce();
  rerender(<LiveBillTotals form={form} onNext={onNext} disabled/>);
  fireEvent.click(screen.getByRole("button",{name:"ตรวจสอบบิล"}));expect(onNext).toHaveBeenCalledOnce();
});
it("keeps_large_receipt_amount_and_live_updates_available",()=>{
  const form=draftFixture();form.draft.items[0].priceSatang=98765432100;
  const {rerender}=render(<LiveBillTotals form={form} onNext={()=>undefined}/>);
  expect(screen.getByRole("button",{name:/ยอดล่าสุด/}).textContent).toContain("987654321.00 บาท");
  form.draft.items[0].priceSatang=10000;rerender(<LiveBillTotals form={form} onNext={()=>undefined}/>);
  expect(screen.getByRole("button",{name:/ยอดล่าสุด/}).textContent).toContain("100.00 บาท");
});
it("reserves_keyboard_occlusion_along_with_bar",()=>{
  const viewport=Object.assign(new EventTarget(),{height:500,offsetTop:0});
  vi.stubGlobal("visualViewport",viewport);vi.stubGlobal("innerHeight",800);
  function Page(){const [height,setHeight]=useState(0);return <><LiveBillTotals form={draftFixture()} onNext={()=>undefined} onHeightChange={setHeight}/><output aria-label="พื้นที่เผื่อด้านล่าง">{height}</output></>;}
  render(<Page/>);
  expect(screen.getByRole("status",{name:"พื้นที่เผื่อด้านล่าง"}).textContent).toBe("384");
});
