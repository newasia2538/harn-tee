import {afterEach,beforeEach,expect,it,vi} from "vitest";
const worker=vi.hoisted(()=>({env:{DB:null as unknown,BUCKET:undefined as unknown}}));
vi.mock("cloudflare:workers",()=>({env:worker.env}));
import {POST} from "../../app/api/bills/history/route";
import {POST as maintain} from "../../app/api/bills/maintenance/route";
import {sqliteBillDb} from "../helpers/sqlite-bill-db";
import {qrBucket} from "../helpers/qr-bucket";
import {buildBillDocument} from "../../db/document";
import {draftFixture} from "../helpers/draft-fixtures";
import {createOpaqueToken} from "../../lib/harn-tee/tokens";
import type {HistorySyncResponse} from "../../lib/harn-tee/history-state";
let database:ReturnType<typeof sqliteBillDb>,r2:ReturnType<typeof qrBucket>;
beforeEach(()=>{vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(100000);database=sqliteBillDb();r2=qrBucket();worker.env.DB=database.db;worker.env.BUCKET=r2.bucket;database.sqlite.prepare("UPDATE bill_retention_policy SET rollout_at=100000").run();});
afterEach(()=>{database.close();vi.useRealTimers();});
const request=(body:unknown)=>new Request("https://harn-tee.test/api/bills/history",{method:"POST",body:JSON.stringify(body)});
async function seed(title:string){const doc=buildBillDocument(draftFixture().draft,100000,"published");doc.title=title;return database.seed(doc);}
it("returns_only_summaries_for_individually_proven_edit_capabilities",async()=>{
  const a=await seed("A"),b=await seed("B");await seed("secret-other");
  const response=await POST(request({entries:[{localId:"a",editToken:a.editToken,shareToken:a.shareToken},{localId:"b",editToken:b.editToken},{localId:"missing",editToken:createOpaqueToken()}]}));
  expect(response.status).toBe(200);expect(response.headers.get("Cache-Control")).toContain("no-store");
  const body=await response.json() as HistorySyncResponse;expect(body.items).toMatchObject([{localId:"a",kind:"active",summary:{title:"A",totalSatang:10000},shareUsable:true},{localId:"b",kind:"active",summary:{title:"B"},shareUsable:false},{localId:"missing",kind:"missing"}]);
  const raw=JSON.stringify(body);for(const value of ["secret-other","1234567890",a.editToken,a.shareToken])expect(raw).not.toContain(value);
  expect(body.items[0]).toMatchObject({kind:"active"});
  if(body.items[0].kind==="active"){expect(body.items[0].summary).not.toHaveProperty("items");expect(body.items[0].summary).not.toHaveProperty("recipient");}
});
it("deduplicates_storage_lookups_without_cross_wiring_share_proofs",async()=>{
  const a=await seed("A"),b=await seed("B");let lookups=0;
  database.hooks.afterFirst=sql=>{if(sql.includes("FROM bills WHERE edit_token_digest"))lookups++;};
  const response=await POST(request({entries:[{localId:"one",editToken:a.editToken,shareToken:a.shareToken},{localId:"two",editToken:a.editToken,shareToken:b.shareToken}]}));
  expect((await response.json() as HistorySyncResponse).items).toMatchObject([{localId:"one",shareUsable:true,summary:{id:a.id}},{localId:"two",shareUsable:false,summary:{id:a.id}}]);expect(lookups).toBe(1);
});
it("rejects_oversized_batches_and_forbidden_or_malformed_proofs",async()=>{
  const token=createOpaqueToken(),proof={localId:"local",editToken:token};
  for(const entries of [Array.from({length:21},()=>proof),[{...proof,expiresAt:9999999999}],[{...proof,editToken:"../secret"}],[{...proof,editToken:"bad\nvalue"}]])expect((await POST(request({entries}))).status).toBe(400);
  expect((await POST(request({entries:[],padding:"x".repeat(65537)}))).status).toBe(413);
});
it("bounds_streamed_bodies_before_json_parsing",async()=>{
  const body=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(70000));controller.close();}});
  const streamed=new Request("https://harn-tee.test/api/bills/history",{method:"POST",body,duplex:"half"} as RequestInit);
  expect((await POST(streamed)).status).toBe(413);
});
it("maintenance_accepts_no_client_targets_and_exposes_no_bill_directory",async()=>{
  const a=await seed("expired"),b=await seed("active");
  database.sqlite.prepare("UPDATE bills SET last_activity_at=1000,expires_at=100000 WHERE id=?").run(a.id);
  expect((await maintain(request({ids:[b.id]}))).status).toBe(400);
  const response=await maintain(request({}));expect(await response.json()).toEqual({serverNow:100000});
  expect(database.sqlite.prepare("SELECT id FROM bills WHERE id=?").get(a.id)).toBeUndefined();expect(database.sqlite.prepare("SELECT id FROM bills WHERE id=?").get(b.id)).toBeTruthy();
});
it("a_full_legacy_batch_stays_within_the_free_worker_query_budget",async()=>{
  const entries=[];for(let n=0;n<20;n++){const bill=await seed("old"+n);entries.push({localId:"local"+n,editToken:bill.editToken});}
  let calls=0;database.hooks.afterFirst=()=>{calls++;};database.hooks.afterRun=()=>{calls++;};
  const response=await POST(request({entries}));expect(response.status).toBe(200);
  expect((await response.json() as HistorySyncResponse).items.filter((entry:{kind:string})=>entry.kind==="active")).toHaveLength(20);
  expect(calls).toBeLessThanOrEqual(50);
});
it("oversized_unfinished_prices_use_the_same_safe_total_as_the_entry_preview",async()=>{
  const doc=buildBillDocument(draftFixture().draft,100000,"draft");doc.items[0].priceSatang=Number.MAX_SAFE_INTEGER;doc.items.push({...doc.items[0],id:"i2",order:1});
  const bill=await database.seed(doc);
  const response=await POST(request({entries:[{localId:"large",editToken:bill.editToken}]}));
  const item=(await response.json() as HistorySyncResponse).items[0];expect(item.kind==="active"&&item.summary.totalSatang).toBe(0);
});
