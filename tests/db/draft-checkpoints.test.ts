import { beforeEach,describe,expect,it,vi } from "vitest";
const worker=vi.hoisted(()=>({env:{DB:null as unknown,BUCKET:null as unknown}}));
vi.mock("cloudflare:workers",()=>({env:worker.env}));
import {createDraftOnce,readEditCheckpoint,saveDraftCheckpoint,issueDraftShareCapability,publishCheckpoint,readBillByToken} from "../../db/repository";
import {conditionalBillDb} from "../helpers/conditional-bill-db";
import {draftFixture,safeFixture} from "../helpers/draft-fixtures";
import {createOpaqueToken} from "../../lib/harn-tee/tokens";
let database:ReturnType<typeof conditionalBillDb>;
beforeEach(()=>{database=conditionalBillDb();worker.env.DB=database.db;});
describe("conditional draft checkpoints",()=>{
  it("retries the same creation without duplicating or resetting its existing form",async()=>{
    const key=createOpaqueToken(),first=await createDraftOnce(key,safeFixture());
    const changed=safeFixture();changed.draft.title="ใหม่";
    const results=await Promise.all([createDraftOnce(key,changed),createDraftOnce(key,changed)]);
    expect(results.map(x=>x.id)).toEqual([first.id,first.id]);expect(database.rows.size).toBe(1);
    expect(results[0].form?.draft.title).toBe("ทดสอบดราฟต์");
    const raw=[...database.rows.values()][0].payload_json;
    expect(raw).not.toContain(first.editToken);expect(raw).not.toContain(key);
  });
  it("saves partial input but rejects stale writes",async()=>{
    const first=await createDraftOnce(createOpaqueToken(),safeFixture());
    const partial=safeFixture();partial.draft.items[0].name="";partial.draft.items[0].payerIds=[];partial.numbers.prices.i1="7.";partial.step=1;
    const saved=await saveDraftCheckpoint(first.editToken,first.revision,partial);
    expect(saved.kind).toBe("ok");
    expect((await readEditCheckpoint(first.editToken))?.form).toMatchObject({step:1,numbers:{prices:{i1:"7."}}});
    expect((await saveDraftCheckpoint(first.editToken,first.revision,safeFixture())).kind).toBe("conflict");
    expect(await readBillByToken("share",first.shareToken!)).toBeNull();
  });
  it("changes revisions for share issuance and never exposes private form metadata",async()=>{
    const first=await createDraftOnce(createOpaqueToken(),safeFixture());
    const issued=await issueDraftShareCapability(first.editToken,first.revision);expect(issued.kind).toBe("ok");
    if(issued.kind!=="ok")throw new Error("issuance failed");
    expect(issued.value.revision).not.toBe(first.revision);
    expect((await readBillByToken("edit",first.editToken))?.document).not.toHaveProperty("draftForm");
    expect((await saveDraftCheckpoint(first.editToken,first.revision,safeFixture())).kind).toBe("conflict");
  });
  it("publishes once and rejects a late autosave or published share rotation",async()=>{
    const first=await createDraftOnce(createOpaqueToken(),safeFixture());
    const published=await publishCheckpoint(first.editToken,first.revision,draftFixture(),"confirmation1",first.shareToken);
    expect(published.kind).toBe("ok");if(published.kind!=="ok")throw new Error("publish failed");
    expect(published.value.document.status).toBe("published");
    expect((await saveDraftCheckpoint(first.editToken,published.value.revision,safeFixture())).kind).toBe("conflict");
    expect((await issueDraftShareCapability(first.editToken,published.value.revision)).kind).toBe("conflict");
    const replay=await publishCheckpoint(first.editToken,first.revision,draftFixture(),"confirmation1",first.shareToken);
    expect(replay).toMatchObject({kind:"ok",value:{lastConfirmationId:"confirmation1"}});
    expect((await readBillByToken("share",first.shareToken!))?.document).not.toHaveProperty("lastConfirmationId");
  });
  it("sanitizes legacy national ID values from both draft projections",async()=>{
    const first=await createDraftOnce(createOpaqueToken(),safeFixture());
    const row=database.rows.get(first.id)!;const doc=JSON.parse(row.payload_json);doc.recipient.promptPay={type:"national-id",value:"1234567890123"};delete doc.draftForm;row.payload_json=JSON.stringify(doc);
    const read=await readEditCheckpoint(first.editToken);expect(JSON.stringify(read)).not.toContain("1234567890123");
    expect(await readEditCheckpoint("wrong")).toBeNull();
  });
  it("acknowledges its own committed version, not a racing peer's newer document",async()=>{
    const first=await createDraftOnce(createOpaqueToken(),safeFixture());
    database.hooks.afterUpdate=row=>{const doc=JSON.parse(row.payload_json);doc.title="peer";doc.draftForm.draft.title="peer";database.rows.set(row.id,{...row,payload_json:JSON.stringify(doc)});};
    const mine=safeFixture();mine.draft.title="mine";
    const result=await saveDraftCheckpoint(first.editToken,first.revision,mine);
    expect(result).toMatchObject({kind:"ok",value:{form:{draft:{title:"mine"}}}});
    if(result.kind!=="ok")throw new Error("write failed");
    expect(result.value.revision).not.toBe((await readEditCheckpoint(first.editToken))?.revision);
    expect((await saveDraftCheckpoint(first.editToken,result.value.revision,mine)).kind).toBe("conflict");
  });
});
