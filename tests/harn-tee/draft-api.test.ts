import {describe,expect,it,vi} from "vitest";
import {createDraftApi,DraftApiError} from "../../lib/harn-tee/draft-api";
import {draftFixture,safeFixture} from "../helpers/draft-fixtures";
import {buildBillDocument} from "../../db/document";
import type {SafeDraftForm} from "../../lib/harn-tee/draft-state";
const ack=()=>({id:"b1",document:buildBillDocument(draftFixture().draft),form:safeFixture(),revision:"r1"});
describe("draft HTTP client",()=>{
  it("sanitizes background requests again and quotes the conditional revision",async()=>{
    const calls:RequestInit[]=[];
    const fetcher=vi.fn<typeof fetch>(async(_url,init)=>{calls.push(init!);return Response.json(ack());});
    const unsafe=draftFixture();unsafe.draft.recipient!.promptPay={type:"national-id",value:"1234567890123"};
    await createDraftApi(fetcher).save("edit", "old",unsafe as SafeDraftForm);
    expect(String(calls[0].body)).not.toContain("1234567890123");
    expect(new Headers(calls[0].headers).get("If-Match")).toBe('"old"');
    expect(JSON.parse(String(calls[0].body)).form.draft.recipient.qr).toBeNull();
  });
  it("retains live payment values only for explicit publication",async()=>{
    let body="";const fetcher=vi.fn<typeof fetch>(async(_url,init)=>{body=String(init?.body);return Response.json(ack());});
    const form=draftFixture();form.draft.recipient!.promptPay={type:"national-id",value:"1234567890123"};
    await createDraftApi(fetcher).publish("edit","r1",form,"confirmation","share");
    expect(JSON.parse(body).form.draft.recipient.promptPay.value).toBe("1234567890123");
  });
  it("classifies conflicts without putting body values into errors",async()=>{
    const api=createDraftApi(vi.fn<typeof fetch>(async()=>Response.json({code:"revision-conflict",error:"1234567890123"},{status:409})));
    await expect(api.load("edit")).rejects.toMatchObject({status:409,code:"revision-conflict"});
    try{await api.load("edit");}catch(error){expect(error).toBeInstanceOf(DraftApiError);expect(String(error)).not.toContain("1234567890123");}
  });
});
