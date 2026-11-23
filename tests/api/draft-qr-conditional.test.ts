import {beforeEach,describe,expect,it,vi} from "vitest";
const worker=vi.hoisted(()=>({env:{DB:null as unknown,BUCKET:null as unknown}}));
vi.mock("cloudflare:workers",()=>({env:worker.env}));
import {createDraftOnce,readEditCheckpoint,saveQrForEditToken} from "../../db/repository";
import {POST} from "../../app/api/bills/[token]/qr/route";
import {conditionalBillDb} from "../helpers/conditional-bill-db";
import {safeFixture} from "../helpers/draft-fixtures";
import {createOpaqueToken} from "../../lib/harn-tee/tokens";
let database:ReturnType<typeof conditionalBillDb>;
const bucket={put:vi.fn(async()=>undefined),delete:vi.fn(async()=>undefined)};
const file=()=>new File([new Uint8Array([137,80,78,71,13,10,26,10])],"qr.png",{type:"image/png"});
beforeEach(()=>{database=conditionalBillDb();worker.env.DB=database.db;worker.env.BUCKET=bucket;bucket.put.mockReset().mockResolvedValue(undefined);bucket.delete.mockClear();});
describe("conditional QR association",()=>{
  it("keeps the winning old object and deletes only its fresh upload after a race",async()=>{
    const draft=await createDraftOnce(createOpaqueToken(),safeFixture());
    const row=database.rows.get(draft.id)!;const current=JSON.parse(row.payload_json);current.recipient.qr={objectKey:"old",contentType:"image/png",size:8};row.payload_json=JSON.stringify(current);
    const snapshot=(await readEditCheckpoint(draft.editToken))!;
    bucket.put.mockImplementation(async()=>{const row=database.rows.get(draft.id)!;const winner=JSON.parse(row.payload_json);winner.title="peer";winner.recipient.qr.objectKey="winner";database.rows.set(row.id,{...row,payload_json:JSON.stringify(winner)});});
    await expect(saveQrForEditToken(draft.editToken,file(),{revision:snapshot.revision,mode:"draft"})).rejects.toThrow("revision-conflict");
    const uploaded=(bucket.put.mock.calls as unknown[][])[0][0];
    expect(bucket.delete.mock.calls).toEqual([[uploaded]]);
    expect(JSON.parse(database.rows.get(draft.id)!.payload_json).recipient.qr.objectKey).toBe("winner");
  });
  it("rejects stale uploads without creating an R2 object",async()=>{
    const draft=await createDraftOnce(createOpaqueToken(),safeFixture());const body=new FormData();body.append("file",file());
    const response=await POST(new Request("https://harn-tee.test",{method:"POST",headers:{"If-Match":`"${"A".repeat(43)}"`,"X-Harn-Tee-Save-Mode":"draft"},body}),{params:Promise.resolve({token:draft.editToken})});
    expect(response.status).toBe(409);expect(bucket.put).not.toHaveBeenCalled();
  });
});
