import {describe,expect,it} from "vitest";
import {buildBillDocument} from "../../db/document";
import {advanceLifecycle,paymentProgress,sameDraftActivity,samePublishedContent,summarizeBill} from "../../lib/harn-tee/bill-lifecycle";
import {safeFixture,draftFixture} from "../helpers/draft-fixtures";
const published=()=>buildBillDocument(draftFixture().draft,1000,"published");
describe("bill lifetime",()=>{
  it("normal_thirty_day_boundary",()=>{
    const doc=published(),first=advanceLifecycle(null,null,doc,1000,true);
    expect(first).toEqual({lastActivityAt:1000,allPaidAt:null,expiresAt:2592001000});
    const changed=advanceLifecycle(first,doc,{...doc,title:"ใหม่"},2000,true);
    expect(changed.expiresAt).toBe(2592002000);
  });
  it("completion_reversion_and_recompletion",()=>{
    const doc=published(),first=advanceLifecycle(null,null,doc,1000,true);
    const paid={...doc,participants:doc.participants.map(p=>({...p,paid:true,paidAt:2000}))};
    const complete=advanceLifecycle(first,doc,paid,2000,true);
    expect(complete).toEqual({lastActivityAt:2000,allPaidAt:2000,expiresAt:604802000});
    const reverted=advanceLifecycle(complete,paid,doc,3000,true);
    expect(reverted).toEqual({lastActivityAt:3000,allPaidAt:null,expiresAt:2592003000});
    expect(advanceLifecycle(reverted,doc,paid,4000,true).expiresAt).toBe(604804000);
  });
  it("no_op_never_renews",()=>{
    const doc=published(),first=advanceLifecycle(null,null,doc,1000,true);
    expect(advanceLifecycle(first,doc,{...doc,updatedAt:99999},99999,false)).toEqual(first);
    const paid={...doc,participants:doc.participants.map(p=>({...p,paid:true}))};
    const complete=advanceLifecycle(first,doc,paid,2000,true);
    expect(advanceLifecycle(complete,paid,paid,99999,false)).toEqual(complete);
    expect(advanceLifecycle(complete,paid,{...paid,title:"เปลี่ยนชื่อ"},3000,true)).toEqual({lastActivityAt:3000,allPaidAt:2000,expiresAt:604802000});
  });
  it("zero_due_does_not_block_or_complete",()=>{
    const doc=published();doc.participants[0].paid=true;doc.participants.push({id:"zero",name:"ไม่ได้ซื้อ",order:1,paid:false,paidAt:null});
    expect(paymentProgress(doc)).toEqual({paymentStatus:"paid",paidCount:1,payerCount:1});
    doc.items=[];expect(paymentProgress(doc)).toEqual({paymentStatus:"unpaid",paidCount:0,payerCount:0});
    doc.status="draft";expect(paymentProgress(doc).paymentStatus).toBe("draft");
  });
  it("counts_partial_positive_payers",()=>{
    const doc=published();doc.participants.push({id:"p2",name:"บี",order:1,paid:false,paidAt:null});doc.items[0].payerIds.push("p2");doc.participants[0].paid=true;
    expect(paymentProgress(doc)).toEqual({paymentStatus:"partial",paidCount:1,payerCount:2});
  });
});
describe("meaningful content",()=>{
  it("draft_raw_edit_counts_but_step_does_not",()=>{
    const first=safeFixture(),second=structuredClone(first);second.step=1;
    expect(sameDraftActivity(first,second)).toBe(true);
    first.numbers.prices.i1="7.";second.numbers.prices.i1="7.0";
    expect(sameDraftActivity(first,second)).toBe(false);
  });
  it("published_no_op_ignores_paid_flags_and_timestamps_but_not_payment_or_qr_changes",()=>{
    const first=published(),second=structuredClone(first);second.updatedAt=5000;second.participants[0].paid=true;
    expect(samePublishedContent(first,second)).toBe(true);
    second.recipient.bank!.accountNumber="9999999999";expect(samePublishedContent(first,second)).toBe(false);
    second.recipient=structuredClone(first.recipient);second.recipient.qr={objectKey:"bills/b/qr.png",contentType:"image/png",size:10};
    expect(samePublishedContent(first,second)).toBe(false);
  });
  it("normalizes_object_order_and_names_without_dropping_business_fields",()=>{
    const first=published(),second=structuredClone(first);second.title=" "+first.title+" ";
    second.participants[0]={paidAt:null,paid:false,order:0,name:first.participants[0].name,id:"p1"};
    expect(samePublishedContent(first,second)).toBe(true);
    second.calculationMode="separate";expect(samePublishedContent(first,second)).toBe(false);
  });
  it("safe_draft_comparison_never_treats_a_live_national_id_as_saved_data",()=>{
    const first=safeFixture(),second=structuredClone(first);
    first.draft.recipient!.promptPay={type:"national-id",value:"1234567890123"};
    second.draft.recipient!.promptPay={type:"national-id",value:""};
    expect(sameDraftActivity(first,second)).toBe(true);
  });
  it("summary_uses_receipt_total_and_contains_no_payment_details",()=>{
    const doc=published();doc.serviceChargePercent=10;doc.vatPercent=7;
    const life={lastActivityAt:1000,allPaidAt:null,expiresAt:2592001000};
    const summary=summarizeBill(doc,"b1","revision",life);
    expect(summary.totalSatang).toBe(11770);expect(summary.lifecycle).toMatchObject({paymentStatus:"unpaid",paidCount:0,payerCount:1});
    expect(JSON.stringify(summary)).not.toContain("1234567890");expect(summary).not.toHaveProperty("recipient");expect(summary).not.toHaveProperty("items");
  });
});
