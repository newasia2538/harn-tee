import {afterEach,beforeEach,expect,it,vi} from "vitest";
const worker=vi.hoisted(()=>({env:{DB:null as unknown,BUCKET:undefined as unknown}}));
vi.mock("cloudflare:workers",()=>({env:worker.env}));
import {GET as getBill,PATCH,DELETE} from "../../app/api/bills/[token]/route";
import {GET as getDraft,PUT} from "../../app/api/bills/[token]/draft/route";
import {POST as publish} from "../../app/api/bills/[token]/publish/route";
import {POST as issue} from "../../app/api/bills/[token]/share-capability/route";
import {POST as status} from "../../app/api/bills/[token]/status/route";
import {GET as payment} from "../../app/api/bills/[token]/payment-details/route";
import {GET as getQr,POST as uploadQr} from "../../app/api/bills/[token]/qr/route";
import {readEditCheckpoint} from "../../db/repository";
import {initializeLegacyRow,type StoredBillRow} from "../../db/bill-retention-store";
import {drainBillQrCleanup,revokeBillSnapshot} from "../../db/bill-deletion";
import {sqliteBillDb} from "../helpers/sqlite-bill-db";
import {qrBucket} from "../helpers/qr-bucket";
import {buildBillDocument} from "../../db/document";
import {draftFixture,safeFixture} from "../helpers/draft-fixtures";
let database:ReturnType<typeof sqliteBillDb>,r2:ReturnType<typeof qrBucket>,owner:{id:string;editToken:string;shareToken:string},revision:string;
const context=(token:string)=>({params:Promise.resolve({token})});
beforeEach(async()=>{
  vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(100000);database=sqliteBillDb();r2=qrBucket();worker.env.DB=database.db;worker.env.BUCKET=r2.bucket;
  const doc=buildBillDocument(draftFixture().draft,100000,"published");doc.recipient.promptPay={type:"national-id",value:"1234567890123"};doc.recipient.qr={objectKey:"bills/bill-test/private.png",contentType:"image/png",size:3};
  owner=await database.seed(doc,"bill-test");r2.objects.set("bills/bill-test/private.png",new Uint8Array([1,2,3]));
  const row=(await database.db.prepare("SELECT * FROM bills WHERE id=?").bind(owner.id).first<StoredBillRow>())!;
  await initializeLegacyRow({DB:database.db},row,100000);revision=(await readEditCheckpoint(owner.editToken))!.revision;
});
afterEach(()=>{database.close();vi.useRealTimers();});
const operations=["get","patch","draft-get","draft-put","publish","issue","status","legacy-status","payment","qr-get","qr-post"] as const;
async function invoke(operation:typeof operations[number],token:string){
  const endpoint="https://harn-tee.test/api/bills/"+token,headers={"Content-Type":"application/json","If-Match":`"${revision}"`};
  const request=(method:string,body?:unknown)=>new Request(endpoint,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})});
  switch(operation){
    case "get":return getBill(request("GET"),context(token));
    case "patch":return PATCH(request("PATCH",{title:"changed"}),context(token));
    case "draft-get":return getDraft(request("GET"),context(token));
    case "draft-put":return PUT(request("PUT",{form:safeFixture()}),context(token));
    case "publish":return publish(request("POST",{form:draftFixture(),confirmationId:"c"}),context(token));
    case "issue":return issue(request("POST",{}),context(token));
    case "status":return status(request("POST",{participantId:"p1",paid:true}),context(token));
    case "legacy-status":return status(new Request(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({participantId:"p1",paid:true})}),context(token));
    case "payment":return payment(new Request(endpoint+"/payment-details?field=bank"),context(token));
    case "qr-get":return getQr(request("GET"),context(token));
    case "qr-post":return uploadQr(request("POST",{}),context(token));
  }
}
for(const state of ["expired","deleting","deleted"] as const)for(const operation of operations){
  it(`${operation} denies ${state} without returning personal data`,async()=>{
    if(state==="expired")vi.setSystemTime(2592100000);
    else{
      const row=(await database.db.prepare("SELECT * FROM bills WHERE id=?").bind(owner.id).first<StoredBillRow>())!;
      await revokeBillSnapshot({DB:database.db,BUCKET:r2.bucket},row,"manual",100000);
      if(state==="deleted")await drainBillQrCleanup({DB:database.db,BUCKET:r2.bucket},owner.id,100000,20);
    }
    const response=await invoke(operation,owner.editToken);expect(response.status).toBe(410);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    const body=await response.text();expect(body).not.toContain("1234567890");expect(body).not.toContain("1234567890123");expect(body).not.toContain("ทดสอบดราฟต์");expect(body).not.toContain("private.png");
    expect(JSON.parse(body).code).toBe(state==="deleted"?"bill-deleted":"bill-deleting");
  });
}
for(const operation of operations)it(`${operation} keeps unknown links at 404`,async()=>{expect((await invoke(operation,"unknown-token")).status).toBe(404);});
it("missing_delete_precondition_never_revokes_the_bill",async()=>{
  const response=await DELETE(new Request("https://harn-tee.test",{method:"DELETE"}),context(owner.editToken));
  expect(response.status).toBe(428);expect(database.sqlite.prepare("SELECT COUNT(*) AS n FROM bills").get()?.n).toBe(1);
  expect(database.sqlite.prepare("SELECT COUNT(*) AS n FROM bill_deletions").get()?.n).toBe(0);
});
it("share_only_delete_is_denied_even_with_an_owner_revision",async()=>{
  expect((await DELETE(new Request("https://harn-tee.test",{method:"DELETE",headers:{"If-Match":`"${revision}"`}}),context(owner.shareToken))).status).toBe(404);
});
it("authorized_delete_returns_the_idempotent_completion_without_a_bill_payload",async()=>{
  const remove=()=>DELETE(new Request("https://harn-tee.test",{method:"DELETE",headers:{"If-Match":`"${revision}"`}}),context(owner.editToken));
  expect(await (await remove()).json()).toEqual({state:"deleted",serverNow:100000});expect((await remove()).status).toBe(200);
});
it("shared_summary_includes_safe_lifecycle_but_no_private_content_revision",async()=>{
  const response=await getBill(new Request("https://harn-tee.test"),context(owner.shareToken));
  const body=await response.json();expect(body).toMatchObject({id:"bill-test",lifecycle:{paymentStatus:"unpaid",expiresAt:2592100000},serverNow:100000});
  expect(body).not.toHaveProperty("revision");expect(JSON.stringify(body)).not.toContain("1234567890");
});
it("invalid_legacy_payment_status_cannot_extend_the_bill_lifetime",async()=>{
  const response=await status(new Request("https://harn-tee.test",{method:"POST",body:JSON.stringify({participantId:"absent",paid:true})}),context(owner.shareToken));
  expect(response.status).toBe(400);expect(database.sqlite.prepare("SELECT expires_at FROM bills WHERE id=?").get(owner.id)?.expires_at).toBe(2592100000);
});
