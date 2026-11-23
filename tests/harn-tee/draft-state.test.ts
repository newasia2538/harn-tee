import { describe, expect, it } from "vitest";
import { changePromptPayType, formFromDocument, makeBlankForm, parseNumericInput, parseStoredCheckpoint, sanitizeDraftForm, setNumericInput, validateFormForPublication } from "../../lib/harn-tee/draft-state";
import {buildBillDocument} from "../../db/document";

function fixture() {
  const form = makeBlankForm();
  form.draft.participants = [{id:"p1",name:" เอ ",order:0}];
  form.draft.items = [{id:"i1",name:"",priceSatang:0,payerIds:[],order:0}];
  form.draft.recipient = {name:"ผู้รับ",bank:{bankId:"SCB",accountNumber:"1234567890"},promptPay:{type:"national-id",value:"1234567890123"},qr:null,visible:false};
  return form;
}

describe("draft persistence contracts", () => {
  it("validates restored form metadata without treating it as submitted bill data",()=>{
    const form=makeBlankForm();form.draft.participants[0].name="เอ";form.draft.items[0].name="ข้าว";form.draft.items[0].priceSatang=10000;form.draft.recipient!.promptPay={type:"phone",value:"0812345678"};
    expect(validateFormForPublication(sanitizeDraftForm(form)).valid).toBe(true);
  });
  it("initializes controlled fee values from existing bill amounts",()=>{
    const form=fixture();form.draft.vatPercent=7;form.draft.serviceChargePercent=10;
    expect(formFromDocument(buildBillDocument(form.draft)).numbers).toMatchObject({vat:"7",service:"10"});
  });
  it("removes national ID without changing the active form or other payment settings", () => {
    const live = fixture(); const safe = sanitizeDraftForm(live);
    expect(safe.draft.recipient?.promptPay).toEqual({type:"national-id",value:""});
    expect(JSON.stringify(safe)).not.toContain("1234567890123");
    expect(safe.paymentReentryRequired).toBe(true);
    expect(safe.draft.recipient?.bank?.accountNumber).toBe("1234567890");
    expect(safe.draft.recipient?.visible).toBe(false);
    expect(live.draft.recipient?.promptPay?.value).toBe("1234567890123");
    expect(safe.draft.participants[0].name).toBe(" เอ ");
  });
  it("clears values when switching PromptPay type and never stores an overlength phone prefix", () => {
    const live=fixture(); const recipient=changePromptPayType(live.draft.recipient!,"phone");
    expect(recipient.promptPay).toEqual({type:"phone",value:""});
    live.draft.recipient!.promptPay={type:"phone",value:"1234567890123"};
    expect(sanitizeDraftForm(live).draft.recipient?.promptPay?.value).toBe("");
    live.draft.recipient!.promptPay={type:"phone",value:"0812345678"};
    expect(sanitizeDraftForm(live).draft.recipient?.promptPay?.value).toBe("0812345678");
  });
  it("preserves unfinished price and empty payer selection while dropping non-form data", () => {
    const live=setNumericInput(fixture(),{kind:"price",itemId:"i1"},"7.");
    Object.assign(live.draft.items[0],{previewUrl:"data:secret",rawLine:"secret",unknown:true});
    live.numbers.prices.removed="9";
    const safe=sanitizeDraftForm(live);
    expect(safe.numbers.prices).toEqual({i1:"7."});
    expect(safe.draft.items[0].payerIds).toEqual([]);
    expect(safe.draft.items[0].priceSatang).toBe(0);
    expect(JSON.stringify(safe)).not.toContain("secret");
    expect(validateFormForPublication(live).valid).toBe(false);
  });
  it.each([["7.","price",null,false],["", "price",null,false],["1,234.50","price",123450,true],["0","price",0,true],["-2","price",null,false],["1e2","price",null,false],["1,23","price",null,false],["NaN","price",null,false],["90071992547409999","price",null,false],["101","percent",null,false],["7.00","percent",7,true],["7.001","percent",null,false]] as const)("parses %s as bounded %s input", (raw,kind,value,complete) => {
    expect(parseNumericInput(raw,kind)).toEqual({value,complete});
  });
  it("normalizes safe numeric fields without exposing malformed arithmetic", () => {
    const live=fixture(); live.draft.items[0].priceSatang=Number.NaN;
    live.draft.vatPercent=-1;
    expect(sanitizeDraftForm(live).draft.items[0].priceSatang).toBe(0);
    expect(sanitizeDraftForm(live).draft.vatPercent).toBe(0);
  });
  it("does not treat future checkpoints as an empty draft", () => {
    expect(()=>parseStoredCheckpoint({schemaVersion:2,kind:"working"})).toThrow();
  });
  it("creates fresh blank identities and no prefilled payment data", () => {
    const a=makeBlankForm(),b=makeBlankForm();
    expect(a.draft.participants[0].id).not.toBe(b.draft.participants[0].id);
    expect(a.draft.recipient?.bank).toBeNull();
    expect(a.numbers.vat).toBe("");
    expect(a.draft.calculationMode).toBe("vat-after-service");
  });
});
