import {beforeEach,describe,expect,it,vi} from "vitest";
const worker=vi.hoisted(()=>({env:{DB:null as unknown,BUCKET:null as unknown}}));
vi.mock("cloudflare:workers",()=>({env:worker.env}));
import {POST} from "../../app/api/bills/drafts/route";
import {GET,PUT} from "../../app/api/bills/[token]/draft/route";
import {conditionalBillDb} from "../helpers/conditional-bill-db";
import {safeFixture} from "../helpers/draft-fixtures";
import {createOpaqueToken} from "../../lib/harn-tee/tokens";
import {createDraftOnce} from "../../db/repository";
import type {DraftAck} from "../../lib/harn-tee/draft-state";
let database:ReturnType<typeof conditionalBillDb>;
beforeEach(()=>{database=conditionalBillDb();worker.env.DB=database.db;});
const context=(token:string)=>({params:Promise.resolve({token})});
const request=(body:unknown,revision?:string)=>new Request("https://harn-tee.test/api/bills/e/draft",{method:"PUT",headers:{"Content-Type":"application/json",...(revision?{"If-Match":`"${revision}"`}:{})},body:JSON.stringify(body)});
describe("draft recovery APIs",()=>{
  it("requires a precondition without mutating an authorized draft",async()=>{
    const draft=await createDraftOnce(createOpaqueToken(),safeFixture()),before=database.rows.get(draft.id)!.payload_json;
    const response=await PUT(request({form:safeFixture()}),context(draft.editToken));
    expect(response.status).toBe(428);expect(database.rows.get(draft.id)!.payload_json).toBe(before);
  });
  it("authorizes edit access before parsing an attacker body",async()=>{
    const draft=await createDraftOnce(createOpaqueToken(),safeFixture());
    const response=await PUT(new Request("https://harn-tee.test",{method:"PUT",body:"not JSON"}),context(draft.shareToken!));
    expect(response.status).toBe(404);
    expect((await GET(new Request("https://harn-tee.test"),context(draft.shareToken!))).status).toBe(404);
  });
  it("persists partial fields, strips national ID independently, and refuses a stale update",async()=>{
    const draft=await createDraftOnce(createOpaqueToken(),safeFixture());const form=safeFixture();form.step=1;form.draft.items[0].payerIds=[];form.draft.items[0].name="";form.numbers.prices.i1="7.";form.draft.recipient!.promptPay={type:"national-id",value:"1234567890123"};
    const saved=await PUT(request({form},draft.revision),context(draft.editToken));expect(saved.status).toBe(200);
    expect(database.rows.get(draft.id)!.payload_json).not.toContain("1234567890123");
    const body=await saved.json() as DraftAck;expect(body.form!.numbers.prices.i1).toBe("7.");expect(saved.headers.get("Cache-Control")).toContain("no-store");expect(saved.headers.get("ETag")).toBe(`"${body.revision}"`);
    expect((await PUT(request({form:safeFixture()},draft.revision),context(draft.editToken))).status).toBe(409);
  });
  it("creates one bounded empty draft and defaults an omitted recipient",async()=>{
    const form=safeFixture();form.draft.items=[];form.draft.participants=[];delete form.draft.recipient;
    const key=createOpaqueToken();const make=()=>new Request("https://harn-tee.test/api/bills/drafts",{method:"POST",body:JSON.stringify({creationKey:key,form})});
    const response=await POST(make());expect(response.status).toBe(200);expect((await POST(make())).status).toBe(200);expect(database.rows.size).toBe(1);
  });
  it("rejects non-owned QR keys and unknown payload fields",async()=>{
    const draft=await createDraftOnce(createOpaqueToken(),safeFixture());const form=safeFixture();form.draft.recipient!.qr={objectKey:"bills/other/qr.png",contentType:"image/png",size:10};
    expect((await PUT(request({form},draft.revision),context(draft.editToken))).status).toBe(400);
    expect((await PUT(request({form:safeFixture(),role:"admin"},draft.revision),context(draft.editToken))).status).toBe(400);
  });
});
