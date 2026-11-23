import {beforeEach,describe,expect,it,vi} from "vitest";
const worker=vi.hoisted(()=>({env:{DB:null as unknown,BUCKET:null as unknown}}));
vi.mock("cloudflare:workers",()=>({env:worker.env}));
import {POST} from "../../app/api/bills/[token]/publish/route";
import {POST as issueShare} from "../../app/api/bills/[token]/share-capability/route";
import {POST as setPaid} from "../../app/api/bills/[token]/status/route";
import {conditionalBillDb} from "../helpers/conditional-bill-db";
import {draftFixture,safeFixture} from "../helpers/draft-fixtures";
import {createDraftOnce,publishCheckpoint} from "../../db/repository";
import {createOpaqueToken} from "../../lib/harn-tee/tokens";
import type {DraftAck} from "../../lib/harn-tee/draft-state";
beforeEach(()=>{worker.env.DB=conditionalBillDb().db;});
const context=(token:string)=>({params:Promise.resolve({token})});
const req=(body:unknown,rev:string)=>new Request("https://harn-tee.test",{method:"POST",headers:{"If-Match":`"${rev}"`},body:JSON.stringify(body)});
describe("explicit draft publication",()=>{
  it("does not let a stale owner payment toggle adopt a newer financial revision",async()=>{
    const draft=await createDraftOnce(createOpaqueToken(),safeFixture());const first=await publishCheckpoint(draft.editToken,draft.revision,draftFixture(),"first",draft.shareToken);if(first.kind!=="ok")throw new Error("fixture");
    const changed=draftFixture();changed.draft.items[0].priceSatang=25000;await publishCheckpoint(draft.editToken,first.value.revision,changed,"peer");
    const response=await setPaid(req({participantId:"p1",paid:true},first.value.revision),context(draft.editToken));expect(response.status).toBe(409);
  });
  it("validates the live national ID but allows a lost-response replay without re-entry",async()=>{
    const draft=await createDraftOnce(createOpaqueToken(),safeFixture());const form=draftFixture();form.draft.recipient!.promptPay={type:"national-id",value:""};
    expect((await POST(req({form,confirmationId:"c1",shareToken:draft.shareToken},draft.revision),context(draft.editToken))).status).toBe(400);
    form.draft.recipient!.promptPay=null;
    const response=await POST(req({form,confirmationId:"c1",shareToken:draft.shareToken},draft.revision),context(draft.editToken));expect(response.status).toBe(200);
    form.draft.recipient!.promptPay={type:"national-id",value:""};
    const replay=await POST(req({form,confirmationId:"c1",shareToken:draft.shareToken},draft.revision),context(draft.editToken));expect(replay.status).toBe(200);expect((await replay.json() as DraftAck).lastConfirmationId).toBe("c1");
  });
  it("issues a draft-only share capability for another edit-link holder",async()=>{
    const draft=await createDraftOnce(createOpaqueToken(),safeFixture());
    const response=await issueShare(req({},draft.revision),context(draft.editToken));expect(response.status).toBe(200);const capability=await response.json() as {shareToken:string;revision:string};
    expect(capability.shareToken).not.toBe(draft.shareToken);
    const response2=await POST(req({form:draftFixture(),confirmationId:"c2",shareToken:capability.shareToken},capability.revision),context(draft.editToken));expect(response2.status).toBe(200);
    const published=await response2.json() as DraftAck;expect((await issueShare(req({},published.revision),context(draft.editToken))).status).toBe(409);
  });
});
